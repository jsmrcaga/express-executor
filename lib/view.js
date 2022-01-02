const { Fields, Queryset } = require('@jsmrcaga/executor');
const Controller = require('./controller');
const { GenericSerializer, DeserializationError } = require('./serializers/serializers');
const { RequestError, AuthorizationError } = require('./errors');

const BaseView = require('./views/view');

class View extends BaseView {
	constructor() {
		if (!this.constructor.Model) {
			throw new Error(`You have to set a Model for your ${this.constructor.name} view`);
		}
	}

	get_queryset(req) {
		throw new Error(`You have to override ${this.constructor.name}.get_queryset(req)`);
	}

	paginate_queryset(req, queryset) {
		// Automatic pagination
		let { limit = this.constructor.page_size, offset } = req.query;
		limit = limit && +limit;
		if (limit && Number.isInteger(limit)) {
			queryset.limit(limit);
		}

		offset = offset && +offset;
		if (offset && Number.isInteger(offset)) {
			// TODO: implement skip() in @jsmrcaga/executor
			queryset.raw({
				$skip: offset
			});
		}

		return queryset;
	}

	filter_queryset(req, queryset) {
		// Only return active objects
		if (!req.query.include_deleted) {
			queryset = queryset.active();
		}

		return queryset;
	}

	queryset(req) {
		let queryset = this.get_queryset(req);
		if (!(queryset instanceof Queryset)) {
			throw new Error(`Please make sure that ${this.constructor.name}.get_queryset() returns an instance of QuerySet`);
		}

		queryset = this.filter_queryset(req, queryset);
		if (!(queryset instanceof Queryset)) {
			throw new Error(`Please make sure that ${this.constructor.name}.filter_queryset() returns an instance of QuerySet`);
		}

		queryset = this.paginate_queryset(req, queryset);
		if (!(queryset instanceof Queryset)) {
			throw new Error(`Please make sure that ${this.constructor.name}.paginate_queryset() returns an instance of QuerySet`);
		}

		return queryset;
	}

	get_object(req) {
		const pk = this.get_lookup_field();
		const pk_param = this.get_pk_param(req);
		let qs = this.queryset(req);
		qs = qs.filter({
			[pk]: pk_param
		});

		return qs.get();
	}

	get_lookup_field() {
		const { Model } = this.constructor;
		if (this.constructor.lookup_key) {
			return this.constructor.lookup_key;
		}

		const [pk] = Fields.pk(Model.VALIDATION_SCHEMA);
		return pk;
	}

	get_lookup_name() {
		const { name } = this.constructor.Model;
		return `${name.toLowerCase()}_id`;
	}

	get_pk_param(req) {
		const lookup = this.get_lookup_name();
		return req.params[lookup];
	}

	get_instance_name() {
		const { name } = this.constructor.Model;
		return name.toLowerCase();
	}

	get_filter_params(req) {
		return {};
	}

	get_save_params(req) {
		return {};
	}

	get_controller() {
		const controller = new Controller();
		controller.use('/', this.authorizer_middleware());

		const lookup = this.get_lookup_name();
		const lookup_path = `/:${lookup}`;

		// Object lookup
		controller.use(lookup_path, (req, res, next) => {
			// Error used for unit testing, should not happen
			// in production since route will never match
			if (!req.params[lookup]) {
				throw new Error(`Please call view with ${lookup} param`);
			}

			this.get_object(req).then(doc => {
				req[this.get_instance_name()] = doc;
				return next();
			}).catch(e => {
				if (e instanceof Queryset.DoesNotExist) {
					return res.sendStatus(404);
				}

				next(e);
			});
		});

		return controller;
	}

	// Do nothing to authorize, since the controller()
	// method will try to apply authorization again.
	// Problem with the order the routes are made in express
	authorize_controller() {}

	is_lookup(req) {
		const lookup = this.get_lookup_name();
		return lookup in req.params;
	}

	get(req) {
		if(this.is_lookup(req)) {
			return this.retrieve(req);
		}

		return this.list(req);
	}

	post(req, body) {
		return this.create(req, body);
	}

	patch(req, body) {
		if(this.is_lookup(req)) {
			return this.update(req, body);
		}

		return this.bulk_update(req);
	}

	delete(req, body) {
		if(this.is_lookup(req)) {
			return this.delete_one(req, body);
		}

		return this.bulk_delete(req);
	}

	list(req) {
		const { Model, SerializerClass } = this.constructor;

		const qs = this.queryset(req);
		return qs.execute().then(objects => {
			const serializer = new SerializerClass({ Model, instance: objects, many: true });
			return serializer.serialize();
		});
	}

	retrieve(req) {
		const instance = req[this.get_instance_name()];
		if (!instance) {
			throw new Error('Request does not have instance, ensure middleware was used');
		}

		const { Model, SerializerClass } = this.constructor;
		const serializer = new SerializerClass({ instance, Model });
		return serializer.serialize();
	}

	create(req, body) {
		this.perform_create(req, body).then(instance => {
			return instance;
		});
	}

	perform_create(req, data) {
		const { Model } = this.constructor;
		const extra_params = this.get_save_params(req);
		const instance = new Model({ ...data, ...extra_params });
		return instance.save();
	}

	delete_one(req, body) {
		const instance = req[this.get_instance_name()];
		instance.delete().then(() => {
			return res.sendStatus(204);
		}).catch(e => next(e));
	}

	bulk_delete(req, res, next) {
		return res.sendStatus(501);

		const { Model } = this.constructor;
		const [pk] = Fields.pk(Model.VALIDATION_SCHEMA);
		const ids = req.body.map(obj => obj instanceof Object ? obj[pk] : obj);
		// Update many to removed
		return Model.collection.updateMany({
			id: {
				$in: ids
			}
		}, {
			__deleted: (new Date()).toISOString()
		}).then(({ acknowledged, modifiedCount }) => {
			if(!acknowledged) {
				return new BaseView.Response({ status: 409 });
			}
			// TODO check that bulk delete actually worked
			if(modifiedCount !== ids.length) {
				return new BaseView.Response({ status: 409 });
			}

			return new BaseView.Response({ status: 204 });
		}).catch(e => {
			next(e);
		});
	}

	update(req, body) {
		const { Model, SerializerClass } = this.constructor;

		const pk = this.get_lookup_field();
		const pk_param = this.get_pk_param(req);

		return this.perform_update(req, data).then(() => {
			return Model.objects.get({ [pk]: pk_param });
		}).then(object => {
			return object;
		}).catch(e => {
			return next(e);
		});
	}

	perform_update(req, data) {
		const instance = req[this.get_instance_name()];
		return instance.update(data);
	}

	bulk_update(req, body) {
		throw new Error('Unsupported');
	}
}

// Default page size
View.page_size = 50;

// Default lookup key is null to search by PK
View.lookup_key = null;

// GenericSerializer doesn't do much
View.SerializerClass = GenericSerializer;

// Model should always be set
View.Model = null;

View.AuthorizationError = AuthorizationError;

module.exports = View;

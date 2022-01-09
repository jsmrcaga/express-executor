const { Fields, Queryset } = require('@jsmrcaga/executor');
const Controller = require('./controller');
const { GenericSerializer, DeserializationError } = require('./serializers/serializers');
const { RequestError, AuthorizationError } = require('./errors');

const BaseView = require('./views/view');

class View extends BaseView {
	constructor() {
		super();

		if (!this.constructor.Model) {
			throw new Error(`You have to set a Model for your ${this.constructor.name} view`);
		}
	}

	get_queryset(req) {
		const { Model } = this.constructor;
		return Model.objects.filter();
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

	get_lookup_path() {
		const lookup = this.get_lookup_name();
		return `/:${lookup}`;
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

	get_serializer(req, instance) {
		if(this.constructor.SerializerClass) {
			return new this.constructor.SerializerClass({
				instance,
				data: req.body,
				many: Array.isArray(instance) || Array.isArray(req.body),
				partial: this.constructor.PartialSerializerMethods.includes(req.method.toUpperCase()),
				Model: this.constructor.Model,
			});
		}

		return null;
	}

	get_controller() {
		const controller = new Controller();
		controller.use('/', this.authorizer_middleware());

		const lookup_path = this.get_lookup_path();
		const lookup = this.get_lookup_name();
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

	apply_controller_methods(controller) {
		const lookup_path = this.get_lookup_path();
		super.apply_controller_methods(controller);

		// Add lookup methods
		controller.get(lookup_path, this.process_middleware());
		controller.delete(lookup_path, this.process_middleware());
		controller.patch(lookup_path, this.process_middleware());
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
		return this.update(req, body);
	}

	delete(req, body) {
		if(this.is_lookup(req)) {
			return this.delete_one(req, body);
		}

		return this.bulk_delete(req);
	}

	list(req) {
		const qs = this.queryset(req);
		return qs.done().then(objects => {
			return objects;
		});
	}

	retrieve(req) {
		const instance = req[this.get_instance_name()];
		if (!instance) {
			throw new Error('Request does not have instance, ensure middleware was used');
		}

		return instance;
	}

	create(req, body) {
		let promise = null;
		if(Array.isArray(body)) {
			promise = this.perform_bulk_create(req, body);
		} else {
			promise = this.perform_create(req, body);
		}

		return promise.then(instance => {
			return this.serialize_out(req, instance);
		}).then(serialized => {
			return new BaseView.Response({
				body: serialized,
				status: 201
			});
		});
	}

	perform_bulk_create(req, data) {
		const { Model } = this.constructor;
		const extra_params = this.get_save_params(req);
		const instances = data.map(i => new Model({ ...i, ...extra_params }));
		return Model.objects.bulk_insert(instances).then(({ insertedCount, insertedIds }) => {
			if(insertedCount !== data.length) {
				// wtf
				throw new RequestError(`Could not insert all objects, inserted ${insertedCount} over ${data.length}`, { status_code: 417 });
			}

			return Model.objects.filter({
				_id: {
					$in: Object.values(insertedIds)
				}
			}).done();
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
		return instance.delete().then(() => {
			return new BaseView.Response({ status: 204 });
		}).catch(e => next(e));
	}

	bulk_delete(req, res, next) {
		const { Model } = this.constructor;
		const [pk] = Fields.pk(Model.VALIDATION_SCHEMA);
		const ids = req.body.map(obj => obj instanceof Object ? obj[pk] : obj);
		// Update many to removed
		return Model.objects.filter({
			[pk]: {
				$in: ids
			}
		}).delete().then(() => {
			return new BaseView.Response({ status: 204 });
		}).catch(e => {
			next(e);
		});
	}

	update(req, body) {
		const { Model } = this.constructor;

		const pk = this.get_lookup_field();
		const pk_param = this.get_pk_param(req);

		let promise = null;
		if(!this.is_lookup(req)) {

			// Make sure we filter in provided queryset
			const qs = this.queryset(req);
			promise = qs.filter({
				id: {
					$in: body.map((obj) => obj[pk])
				}
			}).done().then(objects => {
				return this.perform_bulk_update(req, body, objects);
			}).then(() => {
				const qs = this.queryset(req);
				return qs.filter({
					id: {
						$in: body.map((obj) => obj[pk])
					}
				}).done();
			});
		} else {
			const instance = req[this.get_instance_name()];
			if(!instance) {
				throw new Error('Request does not have instance, ensure middleware was used');
			}

			promise = this.perform_update(req, body, instance).then(() => {
				// Fetch from db to get fresh data ?
				return Model.objects.get({ [pk]: pk_param });
			});
		}

		return promise.then(object => {
			return object;
		}).catch(e => {
			return next(e);
		});
	}

	perform_update(req, data, instance) {
		return instance.update(data);
	}

	perform_bulk_update(req, data, instances) {
		const { Model } = this.constructor;
		const pk = this.get_lookup_field();

		// Update instances in place
		// TODO: transaction
		const promises = instances.map(instance => {
			const body = data.find(d => d[pk] === instance[pk]);
			// Validate all fields instance by instance
			return instance.update(body);
		})
		// todo: check that every object has an ID
		return Promise.all(promises);
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

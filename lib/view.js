const { Fields, Queryset } = require('@jsmrcaga/executor');
const Controller = require('./controller');
const { GenericSerializer, DeserializationError } = require('./serializers/serializers');
const { RequestError, AuthorizationError } = require('./errors');

class View {
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

	get_lookup_param() {
		const { name } = this.constructor.Model;
		return `${name.toLowerCase()}_id`;
	}

	get_pk_param(req) {
		const lookup = this.get_lookup_param();
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

	controller() {
		const controller = new Controller();

		const lookup = this.get_lookup_param();

		const lookup_path = `/:${lookup}`;

		// Authorization
		controller.use('/', (req, res, next) => {
			try {
				const authorization = this.authorize(req, {
					lookup: req.path === lookup_path
				});

				if(!authorization) {
					throw new AuthorizationError();
				}

				req.route_authorized = true;
				if(authorization !== true) {
					req.route_auth = authorization;
				}
				return next();
			} catch(e) {
				if(e instanceof RequestError) {
					return e.format_response(res).json({
						error: e.body || e.message
					});
				}

				throw e;
			}
		});

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

		controller.get('/', this.list.bind(this));
		controller.get(lookup_path, this.retrieve.bind(this));

		controller.post('/', this.create.bind(this));

		controller.delete(lookup_path, this.delete.bind(this));
		controller.delete('/', this.bulk_delete.bind(this));

		controller.patch('/', this.bulk_update.bind(this));
		controller.patch(lookup_path, this.update.bind(this));

		return controller;
	}

	authorize(req, params) {
		return true;
	}

	router() {
		return this.controller().router();
	}

	list(req, res, next) {
		const { Model, SerializerClass } = this.constructor;

		const qs = this.queryset(req);
		qs.execute().then(objects => {
			const serializer = new SerializerClass({ Model, instance: objects, many: true });
			return res.json(serializer.serialize());
		}).catch(e => next(e));
	}

	retrieve(req, res, next) {
		const instance = req[this.get_instance_name()];
		if (!instance) {
			throw new Error('Request does not have instance, ensure middleware was used');
		}

		const { Model, SerializerClass } = this.constructor;
		const serializer = new SerializerClass({ instance, Model });
		return res.json(serializer.serialize());
	}

	create(req, res, next) {
		const { Model, SerializerClass } = this.constructor;
		const serializer = new SerializerClass({ data: req.body, Model });

		let data = null;
		try {
			data = serializer.deserialize();
		} catch (e) {
			if (e instanceof DeserializationError) {
				return res.status(400).json({
					errors: e.errors
				});
			}

			return next(e);
		}

		this.perform_create(req, data).then(instance => {
			const serializer = new SerializerClass({ instance, Model });
			return res.status(201).json(serializer.serialize());
		});
	}

	perform_create(req, data) {
		const { Model } = this.constructor;
		const extra_params = this.get_save_params(req);
		const instance = new Model({ ...data, ...extra_params });
		return instance.save();
	}

	delete(req, res, next) {
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
		const now = Date.now();
		return Model.collection.updateMany({
			id: {
				$in: ids
			}
		}, {
			__deleted: now
		}).then(({ acknowledged, modifiedCount }) => {
			if(!acknowledged) {
				return res.sendStatus(409);
			}
			// TODO check that bulk delete actually worked
			if(modifiedCount !== ids.length) {
				return res.sendStatus(206);
			}

			return res.sendStatus(204);
		}).catch(e => {
			next(e);
		});
	}

	update(req, res, next) {
		const { Model, SerializerClass } = this.constructor;

		const pk = this.get_lookup_field();

		const update_data = { ...req.body };

		// Ensure we get what we asked for
		const serializer = new SerializerClass({ Model, data: update_data, partial: true });

		let data = null;
		try {
			data = serializer.deserialize();
		} catch (e) {
			if (e instanceof DeserializationError) {
				return res.status(400).json({
					errors: e.errors
				});
			}

			return next(e);
		}

		const pk_param = this.get_pk_param(req);
		return this.perform_update(req, data).then(() => {
			return Model.objects.get({ [pk]: pk_param });
		}).then(object => {
			const serializer = new SerializerClass({ Model, instance: object });
			return res.json(serializer.serialize());
		}).catch(e => {
			return next(e);
		});
	}

	perform_update(req, data) {
		const instance = req[this.get_instance_name()];
		return instance.update(data);
	}

	bulk_update(req, res, next) {
		return res.sendStatus(501);
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

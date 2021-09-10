const Controller = require('../controller');
const { BaseSerializer, DeserializationError } = require('../serializers/serializers');
const { RequestError, AuthorizationError } = require('../errors');

class Response {
	constructor({ status=200, body='', headers={} }) {
		this.status = status;
		this.body = body;
		this.headers = headers;
	}

	respond(res) {
		let response = res.status(this.status);
		if(this.headers) {
			// apply headers
			response.set(this.headers);
		}

		return response.json(this.body);
	}
}

class BaseView {
	get allowed_methods() {
		if(!this.constructor.allowed_methods) {
			return null;
		}

		return this.constructor.allowed_methods.map(allowed => allowed.toUpperCase().trim());
	}

	is_method_allowed(method) {
		if(this.allowed_methods && !this.allowed_methods.includes(method.toUpperCase().trim())) {
			return false;
		}

		return true;
	}

	get_controller() {
		// Allows for custom controller implementations
		// and custom hooks before method resolution
		const controller = new Controller();
		return controller;
	}

	controller() {
		const controller = this.get_controller();

		// Authorization
		controller.use('/', this.authorizer_middleware());

		// Methods
		controller.get('/', this.process_middleware());
		controller.post('/', this.process_middleware());
		controller.delete('/', this.process_middleware());
		controller.patch('/', this.process_middleware());

		return controller;
	}

	get_authorization_params() {
		return {};
	}

	get_serializer(req, instance) {
		if(this.constructor.SerializerClass) {
			return new this.constructor.SerializerClass({
				instance,
				data: req.body,
				many: Array.isArray(instance) || Array.isArray(req.body),
				partial: this.constructor.PartialSerializerMethods.includes(req.method.toUpperCase())
			});
		}

		return null;
	}

	authorizer_middleware() {
		return (req, res, next) => {
			try {
				const authorization = this.authorize(req, this.get_authorization_params());

				if(!authorization) {
					throw new AuthorizationError();
				}

				req.route_authorized = true;
				if(authorization !== true) {
					req.route_auth = authorization;
				}
				return next();
			} catch(e) {
				// Includes AuthorizationError
				if(e instanceof RequestError) {
					return e.format_response(res).json({
						error: e.body || e.message
					});
				}

				throw e;
			}
		};
	}

	authorize(req, params) {
		return true;
	}

	router() {
		return this.controller().router();
	}

	process_middleware() {
		return (req, res, next) => {
			const method = req.method.toLowerCase();

			if(!this.is_method_allowed(method)) {
				return res.sendStatus(405);
			}

			if(!this[method.toLowerCase()]) {
				// Method not implemented
				return res.sendStatus(501);	
			}

			const handler = this[method.toLowerCase()].bind(this);

			try {

				const body = this.serialize_in(req);

				Promise.resolve(handler(req, body)).then(result => {
					let response = result;
					if(!(result instanceof Response)) {
						response = new Response({ body: this.serialize_out(req, result) });
					}

					return response.respond(res);
				}).catch(e => {
					if(e instanceof RequestError) {
						return e.format_response(res).json({
							error: e.body || e.message
						});
					}

					return next(e);
				});

			} catch(e) {
				if(e instanceof RequestError) {
					return e.format_response(res).json({
						error: e.body || e.message
					});
				}

				return next(e);
			}
		}
	}

	get(body, req) {
		throw new Error('View.get must be overridden');
	}

	post(body, req) {
		throw new Error('View.post must be overridden');
	}

	delete(body, req) {
		throw new Error('View.delete must be overridden');
	}

	patch(body, req) {
		throw new Error('View.patch must be overridden');
	}

	serialize_in(req) {
		// Ignore methods that don't need serialization
		if(this.constructor.IgnoreSerializerMethods.includes(req.method.toUpperCase())) {
			return req.body;
		}

		const serializer = this.get_serializer(req);
		if(serializer) {
			return serializer.deserialize();
		}
		return req.body;
	}

	serialize_out(req, instance) {
		const serializer = this.get_serializer(req, instance);
		if(serializer) {
			return serializer.serialize();
		}
		return instance;
	}
}

BaseView.IgnoreSerializerMethods = ['GET', 'DELETE', 'HEAD', 'OPTIONS'];
BaseView.PartialSerializerMethods = ['PATCH'];

BaseView.allowed_methods = null;

// BaseSerializer doesn't do much
BaseView.SerializerClass = BaseSerializer;

BaseView.Response = Response;

module.exports = BaseView;

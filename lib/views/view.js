const Controller = require('../controller');
const { BaseSerializer, DeserializationError } = require('../serializers/serializers');
const { RequestError, AuthorizationError } = require('../errors');

class Response {
	constructor({ status=200, body=null, headers={} }) {
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

		if(this.body) {
			return response.json(this.body);
		}

		return response.end();
	}
}

class BaseView {
	promisify(func) {
		try {
			const result = func();
			if(result instanceof Promise) {
				return result;
			}

			return Promise.resolve(result);
		} catch(e) {
			return Promise.reject(e);
		}
	}

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

	authorize_controller(controller) {
		controller.use('/', this.authorizer_middleware());
	}

	apply_controller_methods(controller) {
		controller.get('/', this.process_middleware());
		controller.post('/', this.process_middleware());
		controller.delete('/', this.process_middleware());
		controller.patch('/', this.process_middleware());
	}

	controller() {
		const controller = this.get_controller();

		// Authorization
		this.authorize_controller(controller);

		// Methods
		this.apply_controller_methods(controller);

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
			this.perform_authorization(req, this.get_authorization_params()).then(authorization => {
				if(!authorization) {
					throw new AuthorizationError();
				}

				req.route_authorized = true;
				if(authorization !== true) {
					req.route_auth = authorization;
				}
				return next();
			}).catch(e => {
				// Includes AuthorizationError
				if(e instanceof RequestError) {
					return e.format_response(res).json({
						error: e.body || e.message
					});
				}

				// Next stuff will handle
				return next(e);
			});
		};
	}

	// Wrapper to promisify authorize if needed
	perform_authorization(req, params) {
		return this.promisify(() => this.authorize(req, params));
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

			this.serialize_in(req).then(body => {
				return this.handle(method, req, body);
			}).then(result => {
				let response = result;
				if(result instanceof Response) {
					return response.respond(res);
				}

				return this.serialize_out(req, result).then(body => {
					const response = new Response({ body });
					return response.respond(res);
				});
			}).catch(e => {
				if(e instanceof RequestError) {
					return e.format_response(res).json({
						error: e.body || e.message
					});
				}

				return next(e);
			});
		}
	}

	handle(method, req, body) {
		if(!this[method.toLowerCase()]) {
			// 500
			throw new Error(`No method named ${method.toLowerCase()}`);
		}

		const handler = this[method.toLowerCase()].bind(this);
		return this.promisify(() => handler(req, body));
	}

	get(req) {
		throw new Error('View.get must be overridden');
	}

	post(req, body) {
		throw new Error('View.post must be overridden');
	}

	delete(req, body) {
		throw new Error('View.delete must be overridden');
	}

	patch(req, body) {
		throw new Error('View.patch must be overridden');
	}

	serialize_in(req) {
		// Ignore methods that don't need serialization
		if(this.constructor.IgnoreSerializerMethods.includes(req.method.toUpperCase())) {
			return Promise.resolve(req.body);
		}

		const serializer = this.get_serializer(req);
		if(serializer) {
			return this.promisify(() => serializer.deserialize());
		}
		return Promise.resolve(req.body);
	}

	serialize_out(req, instance) {
		const serializer = this.get_serializer(req, instance);
		if(serializer) {
			return this.promisify(() => serializer.serialize());
		}
		return Promise.resolve(instance);
	}
}

BaseView.IgnoreSerializerMethods = ['GET', 'DELETE', 'HEAD', 'OPTIONS'];
BaseView.PartialSerializerMethods = ['PATCH'];

BaseView.allowed_methods = null;

// BaseSerializer doesn't do much
BaseView.SerializerClass = BaseSerializer;

BaseView.Response = Response;

module.exports = BaseView;

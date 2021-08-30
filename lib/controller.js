const express = require('express');

class Controller {
	constructor(name) {
		this.routing = [];
		this._router = null;
		this.name = name;

		return new Proxy(this, {
			get: (obj, prop) => {
				const hop = Object.prototype.hasOwnProperty.call(obj, prop);
				if (hop || ['router', 'find', 'filter'].includes(prop)) {
					return obj[prop];
				}

				return obj.__route(prop);
			}
		});
	}

	__route(method) {
		return (path, ...handlers) => {
			method = method.toLowerCase();
			this.routing.push({
				path,
				method,
				handlers
			});
		};
	}

	find(method, path) {
		const found = this.routing.find(({ path: p, method: m }) => p === path && m === method);
		if (!found) {
			throw new Error(`Route not found for ${method} ${path}`);
		}

		return found.handlers;
	}

	filter(method, path) {
		const found = this.routing.filter(({ path: p, method: m }) => p === path && m === method);
		return found.length ? found.map(found => found.handlers) : null;
	}

	router() {
		if (this._router) {
			return this.router;
		}

		const router = express.Router();

		for (const route of this.routing) {
			const { method, path, handlers } = route;
			router[method](path, ...handlers);
		}

		// Cache
		this._router = router;
		return router;
	}
}

module.exports = Controller;

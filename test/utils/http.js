const Next = (request, response) => {
	return (e) => {
		if (e) {
			return response.error(e);
		}

		response.go_next();
	};
};

class Request {
	constructor({ body = {}, headers = {}, params = {}, query = {} } = {}) {
		this.body = body;
		this.headers = headers;
		this.params = params;
		this.query = query;
		this.next = Next(this, null);
	}

	get(name) {
		// Get header
		for (const k in this.headers) {
			if (name.toLowerCase() === k.toLowerCase()) {
				return this.headers[k];
			}
		}

		return null;
	}
}

class Response {
	constructor() {
		this.done = false;
		this.status_code = 200;
		this.body = undefined;
		this.next = Next(null, this);
		this.errored = false;
		this._next = false;
		this.headers = {};

		this.events = {
			response: [],
			error: []
		};
	}

	on(event, cb) {
		this.events[event].push(cb);
	}

	emit(event, data) {
		for (const cb of this.events[event]) {
			try {
				cb(data);
			} catch(e) {
				if(event !== 'error') {
					this.emit('error', e);
				}
			}
		}
	}

	error(e) {
		this.errored = e;
		this.emit('error', e);
	}

	go_next() {
		this._next = true;
		this.end();
	}

	end(body) {
		if (this.done) {
			throw new Error('[RequestMock] Already ended');
		}
		this.done = true;
		this.emit('response', this);
	}

	sendStatus(status) {
		this.status_code = status;
		return this.end();
	}

	status(status) {
		this.status_code = status;
		return this;
	}

	json(body) {
		this.body = body;
		return this.end();
	}

	set(headers) {
		this.headers = { ...this.headers, ...headers };
		return this;
	}
};

module.exports = {
	Request,
	Response,
	Next
};

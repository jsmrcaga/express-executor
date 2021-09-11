class RequestError extends Error {
	constructor(message='', { status_code, headers={}, body=null }={}) {
		super(message);
		this.status_code = status_code;
		this.headers = headers;
		this.body = body;
	}

	format_response(res) {
		return res.status(this.status_code).set(this.headers);
	}
}

class AuthorizationError extends RequestError {
	constructor(message='Unauthorized', ...rest) {
		super(message, ...rest);
		this.status_code = 403;
	}
}

class SerializationError extends RequestError {}

class DeserializationError extends RequestError {
	constructor(message, errors, ...rest) {
		super(message, ...rest);
		this.body = errors;
		this.errors = errors;
		this.status_code = 400;
	}
}

module.exports = {
	RequestError,
	AuthorizationError,
	SerializationError,
	DeserializationError
};

class RequestError extends Error {
	constructor(message, { code, headers={}, body=null }) {
		super(message);
		this.code = code;
		this.headers = headers;
		this.body = body;
	}

	format_response(res) {
		return res.status(this.code).set(this.headers);
	}
}

class AuthorizationError extends RequestError {
	constructor(message='Unauthorized', ...rest) {
		super(message, ...rest);
		this.code = 403;
	}
}

module.exports = {
	RequestError,
	AuthorizationError
};

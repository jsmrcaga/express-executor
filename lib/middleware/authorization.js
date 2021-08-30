const { Tokens } = require('../token');

const { RequestError } = require('../errors');

class Authorization {
	constructor({ TokenGenerator=Tokens, header_name='Authorization' }={}) {
		this.token_generator = Tokens;
		this.header_name = header_name;
	}

	parse_header(value){
		return value.replace(/Bearer\s/gi, '');
	}

	pre_auth(req, res) {
		return true;
	}

	authorize(req, token_body) {
		return undefined;
	}

	middleware() {
		return (req, res, next) => {
			try {
				const _continue = this.pre_auth(req, res);
				if(!_continue) {
					// prevent 2ble sending response
					return;
				}
			} catch(e) {
				return next(e);
			}

			const header = req.get(this.header_name);
			if(!header) {
				return res.status(401).json({
					error: `Unauthorized. Please provide a "${this.header_name}" header with your token`
				});
			}

			try {
				const token = this.parse_header(header);

				// Check token
				const token_body = this.token_generator.verify(token);

				// Check authorize method
				Promise.resolve(this.authorize(req, token_body)).then((result) => {
					if(result !== undefined) {
						req.auth = result;
					}

					return next();
				}).catch(e => {
					if(e instanceof RequestError) {
						e.format_response(res).json({
							error: e.body || e.message
						});
					}

					return res.status(403).json({
						error: e.message
					});
				});

			} catch(e) {
				if(e instanceof RequestError) {
					e.format_response(res).json({
						error: e.body || e.message
					});
				}

				return res.status(403).json({
					error: e.message
				});
			}
		};
	}
}

const auth = new Authorization();

module.exports = {
	auth,
	Authorization
};

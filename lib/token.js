const Crypto = require('crypto');

class TokenError extends Error {}

class B64URL {
	static encode(data) {
		let b64 = Buffer.from(data).toString('base64');
		const replacements = [
			[/=/g, ''],
			[/\+/g, '-'],
			[/\//g, '_'],
		];

		for(const [from, to] of replacements) {
			b64 = b64.replace(from, to);
		}

		return b64;
	}

	static b64FromUrl(data) {
		let b64 = data.replace(/\-/g, '+');
		b64 = data.replace(/\_/g, '/');
		const remainder = b64.length % 4;
		if(!remainder) {
			return b64;
		}

		switch(remainder) {
			case 2:
				return `${b64}==`;
			case 3:
				return `${b64}=`;
			default:
				throw new Error('Illegal B64URL string');
		}
	}

	static decode(data) {
		const b64 = this.b64FromUrl(data);
		return Buffer.from(b64, 'base64').toString('utf8');
	}
}

class Token {
	static create(payload, sk) {
		const b64_payload = B64URL.encode(JSON.stringify(payload));

		let header = {
			alg: 'HS256',
			typ: 'JWT'
		};
		header = B64URL.encode(JSON.stringify(header));

		let signature = this.sign({ header, payload: b64_payload }, sk);
		signature = B64URL.encode(signature);

		return `${header}.${b64_payload}.${signature}`;
	}

	static sign({ header, payload }, secret_key) {
		const hmac = Crypto.createHmac('sha256', secret_key);
		const input = `${header}.${payload}`;
		hmac.update(input);
		return hmac.digest('base64');
	}

	static verify(data, sk) {
		const fragments = data.split('.');
		if(fragments.length !== 3) {
			throw new TokenError('Invalid number of fragments');
		}

		const [ header, payload, signed ] = fragments;

		const received_signature = B64URL.decode(signed);
		const body = JSON.parse(B64URL.decode(payload));

		if(body.nbf && body.nbf > (Date.now() / 1000)) {
			throw new TokenError('Token: invalid nbf');
		}

		if(body.exp && body.exp < (Date.now() / 1000)) {
			throw new TokenError('Token: expired token');
		}

		const signature = this.sign({ header, payload }, sk);
		if(signature !== received_signature) {
			throw new TokenError('Token: invalid signature');
		}

		return body;
	}

	static generate(payload, { exp=null, max_age=3600*24, iss }, sk) {
		const iat = Math.floor(Date.now() / 1000);
		const data = {
			iat,
			exp: exp ?? iat + max_age,
			iss,
			...payload
		};

		return this.create(data, sk);
	}
}

class TokenGenerator {
	constructor({ secret_key, iss, max_age }) {
		this.secret_key = secret_key;
		this.iss = iss;
		this.max_age = max_age;
	}

	generate(payload={}) {
		return Token.generate(payload, {
			max_age: this.max_age,
			iss: this.iss,
			exp: payload.exp || null
		}, this.secret_key);
	}

	verify(token) {
		return Token.verify(token, this.secret_key);
	}

	create(payload={}) {
		return Token.create(payload, this.secret_key);
	}
}

// Utility singleton to avoid creating a file just for this
// on applications
const Tokens = new TokenGenerator({
	secret_key: process.env.JWT_SECRET_KEY,
	iss: process.env.JWT_ISS,
	exp: Number.parseInt(process.env.JWT_EXP)
});

Token.TokenError = TokenError;
module.exports = { Token, TokenGenerator, Tokens };

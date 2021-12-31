const { expect } = require('chai');
const { Request, Response } = require('./../testing/http');

const { Authorization } = require('../lib/middleware/authorization');
const { tokens } = require('../lib/token');

const auth = new Authorization();

describe('Authorization', () => {
	describe('Singleton/Default', () => {
		it('Should allow token to pass', done => {
			const token = tokens.generate();

			request = new Request({
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			response = new Response();
			response.on('error', (e) => {
				done(e);
			});

			response.on('response', () => done());

			auth.middleware()(request, response, response.next);
		});

		it('Should 401 because no header', done => {
			request = new Request();

			response = new Response();
			response.on('error', (e) => {
				done(e);
			});

			response.on('response', (r) => {
				expect(r.status_code).to.be.eql(401);
				done();
			});

			auth.middleware()(request, response, response.next);	
		});

		it('Should 403 because of malformed token', done => {
			const token = tokens.generate();
			request = new Request({
				headers: {
					'Authorization': `Plpe ${token}`
				}
			});

			response = new Response();
			response.on('error', (e) => {
				done(e);
			});

			response.on('response', (r) => {
				expect(r.status_code).to.be.eql(403);
				done();
			});

			auth.middleware()(request, response, response.next);
		});
	});

	describe('Extensions', () => {
		it('Should send response on pre-auth', done => {
			class OwnAuth extends Authorization {
				pre_auth(req, res) {
					res.status(567).json({
						error: 'plep'
					});
				}
			}

			const auth = new OwnAuth();

			const request = new Request();
			response = new Response();
			response.on('error', (e) => {
				done(e);
			});

			response.on('response', (r) => {
				expect(r.status_code).to.be.eql(567);
				done();
			});

			auth.middleware()(request, response, response.next);	
		});

		it('Should send 403 because of .authorize()', done => {
			const token = tokens.generate();

			class OwnAuth extends Authorization {
				authorize(req, token_body) {
					throw new Error('Bad token lolilol');
				}
			}

			const auth = new OwnAuth();

			const request = new Request({
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});
			response = new Response();
			response.on('error', (e) => {
				done(e);
			});

			response.on('response', (r) => {
				expect(r.status_code).to.be.eql(403);
				expect(r.body).to.have.property('error');
				expect(r.body.error.includes('lolilol')).to.be.true;
				done();
			});

			auth.middleware()(request, response, response.next);	
		});

		for(const result of [42, Promise.resolve(42)]) {
			it('Should contain result of authorization (no) promise', done => {
				const token = tokens.generate();

				class OwnAuth extends Authorization {
					authorize(req, token_body) {
						return result;
					}
				}

				const auth = new OwnAuth();

				const request = new Request({
					headers: {
						'Authorization': `Bearer ${token}`
					}
				});
				response = new Response();
				response.on('error', (e) => {
					done(e);
				});

				response.on('response', (r) => {
					expect(r.status_code).to.be.eql(200);
					expect(request.auth).to.be.eql(42);
					done();
				});

				auth.middleware()(request, response, response.next);	
			});
		}

	});
});

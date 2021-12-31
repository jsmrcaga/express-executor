const { expect } = require('chai');

const { Fields } = require('@jsmrcaga/executor');

const BaseView = require('../../lib/views/view');
const { BaseSerializer } = require('../../lib/serializers/serializers');
const Controller = require('../../lib/controller');
const { Request, Response } = require('../../testing/http');
const { AuthorizationError, RequestError, DeserializationError } = require('../../lib/errors');

describe('Generic View', () => {
	it('Should instanciate empty', () => {
		const view = new BaseView();
	});

	describe('Controller', () => {
		it('Should return an instance of controller', () => {
			const view = new BaseView();
			expect(view.controller()).to.be.an.instanceof(Controller);
		});

		for(const method of ['use', 'get', 'post', 'delete', 'patch']) {
			it(`Should have an authorization middleware and a single route - ${method}`, () => {
				const view = new BaseView();
				const controller = view.controller();

				expect(controller.find(method, '/')).not.to.be.undefined;
			});
		}
	});

	describe('Handlers', () => {
		for(const method of ['get', 'patch', 'post', 'delete']) {
			it(`Should raise override error for method - ${method}`, () => {
				const view = new BaseView();
				expect(() => view[method]()).to.throw(Error, new RegExp(`View.${method} must be overridden`));
			});
		}
	});

	describe('Authorization middleware', () => {
		it('Should authorize with no further config', done => {
			const view = new BaseView();
			const auth = view.authorizer_middleware();

			const request = new Request();
			const response = new Response();

			response.on('error', (e) => done(e));

			response.on('response', () => {
				expect(request).to.have.property('route_authorized');
				expect(request.route_authorized).to.be.true;
				done();''
			});
			auth(request, response, response.next);
		});

		it('Should authorize with custom auth object', done => {
			class CustomView extends BaseView {
				authorize() {
					return { obj: 45 };
				}
			}

			const view = new CustomView();
			const auth = view.authorizer_middleware();

			const request = new Request();
			const response = new Response();

			response.on('error', (e) => done(e));

			response.on('response', () => {
				expect(request).to.have.property('route_authorized');
				expect(request.route_authorized).to.be.true;
				expect(request).to.have.property('route_auth');
				expect(request.route_auth.obj).to.be.equal(45);
				done();
			});
			auth(request, response, response.next);
		});

		for(const func of [() => false, () => { throw new AuthorizationError() }]) {
			it('Should respond with 403 (false / AuthError)', done => {
				class CustomView extends BaseView {
					authorize() {
						return func();
					}
				}

				const view = new CustomView();
				const auth = view.authorizer_middleware();

				const request = new Request();
				const response = new Response();

				response.on('error', (e) => done(e));

				response.on('response', (res) => {
					expect(res.status_code).to.be.eq(403);
					expect(request).not.to.have.property('route_authorized');
					expect(request).not.to.have.property('route_auth');
					done();
				});
				auth(request, response, response.next);
			});
		}

		it('Should respond with custom error and code', done => {
			class CustomView extends BaseView {
				authorize() {
					throw new RequestError('Test message', {
						status_code: 200,
						headers: {
							'X-API': 456
						}
					});
				}
			}

			const view = new CustomView();
			const auth = view.authorizer_middleware();

			const request = new Request();
			const response = new Response();

			response.on('error', (e) => done(e));

			response.on('response', (res) => {
				expect(res.status_code).to.be.eq(200);
				expect(res.headers).to.have.property('X-API');
				expect(res.headers['X-API']).to.be.eql(456);
				expect(res.body).to.have.property('error');
				expect(res.body.error).to.be.eq('Test message');
				expect(request).not.to.have.property('route_authorized');
				expect(request).not.to.have.property('route_auth');
				done();
			});
			auth(request, response, response.next);
		});
	});

	describe('Process', () => {
		it('405 on method not allowed', () => {
			class CustomView extends BaseView {}
			CustomView.allowed_methods = ['get']

			const view = new CustomView();
			const auth = view.process_middleware();

			const request = new Request();
			const response = new Response();

			response.on('error', (e) => done(e));

			response.on('response', (res) => {
				expect(res.status_code).to.be.eql(405);
				done();
			});
			auth(request, response, response.next);
		});

		it('501 on method not implemented', () => {
			const view = new BaseView();
			const auth = view.process_middleware();

			const request = new Request();
			const response = new Response();

			response.on('error', (e) => done(e));

			response.on('response', (res) => {
				expect(res.status_code).to.be.eql(501);
				done();
			});
			auth(request, response, response.next);
		});

		describe('Serialization', () => {
			describe('In', () => {
				it('400 because of hard coded error on serialize_in', done => {
					class CustomView extends BaseView {
						serialize_in() {
							throw new DeserializationError('plep');
						}
					}
					CustomView.allowed_methods = ['post'];

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({ method: 'POST' });
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(400);
						expect(res.body).to.have.property('error');
						done();
					});
					post(request, response, response.next);
				});

				it('400 because of hard coded error on post', done => {
					class CustomView extends BaseView {
						post() {
							throw new DeserializationError('plep');
						}
					}
					CustomView.allowed_methods = ['post'];

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({ method: 'POST' });
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(400);
						expect(res.body).to.have.property('error');
						done();
					});
					post(request, response, response.next);
				});

				it('400 because of missing data', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true })
					};

					class CustomView extends BaseView {}
					CustomView.allowed_methods = ['post'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({ method: 'POST' });
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(400);
						expect(res.body).to.have.property('error');
						expect(res.body.error).to.have.property('required');
						done();
					});
					post(request, response, response.next);
				});

				it('Passes because method does not need data', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true })
					};

					class CustomView extends BaseView {
						get() {
							return 'plep';
						}
					}
					CustomView.allowed_methods = ['get'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const get = view.process_middleware();

					const request = new Request({ method: 'GET' });
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.be.eql('plep');
						done();
					});
					get(request, response, response.next);
				});

				it('400 because of mistyped data', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true }),
						string: new Fields.String({ required: false }),
					};

					class CustomView extends BaseView {
						post() {
							return 'plep';
						}
					}
					CustomView.allowed_methods = ['post'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({
						method: 'POST',
						body: {
							required: 234
						}
					});
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(400);
						expect(res.body).to.have.property('error');
						expect(res.body.error).to.have.property('required');
						done();
					});
					post(request, response, response.next);
				});

				it('Passes because body contains all data', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true })
					};

					class CustomView extends BaseView {
						post() {
							return 'plep';
						}
					}
					CustomView.allowed_methods = ['post'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({
						method: 'POST',
						body: {
							required: 'plep'
						}
					});
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.be.eql('plep');
						done();
					});
					post(request, response, response.next);
				});

				it('Passes allowing not required data', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true }),
						string: new Fields.String({ required: false }),
					};

					class CustomView extends BaseView {
						post() {
							return 'plep';
						}
					}
					CustomView.allowed_methods = ['post'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const post = view.process_middleware();

					const request = new Request({
						method: 'POST',
						body: {
							required: 'plep'
						}
					});
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.be.eql('plep');
						done();
					});
					post(request, response, response.next);
				});

				it('Passes allowing partial data (PATCH)', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						required: new Fields.String({ required: true }),
						string: new Fields.String({ required: false }),
					};

					class CustomView extends BaseView {
						patch() {
							return 'plep';
						}
					}
					CustomView.allowed_methods = ['patch'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const patch = view.process_middleware();

					const request = new Request({
						method: 'PATCH',
						body: {
							string: 'plep'
						}
					});
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.be.eql('plep');
						done();
					});
					patch(request, response, response.next);
				});
			});

			describe('Out', () => {
				it('Removes unecessary fields', done => {
					class Serializer extends BaseSerializer {}
					Serializer.fields = {
						only_field: new Fields.String({ required: true })
					};

					class CustomView extends BaseView {
						get() {
							return {
								only_field: 'plep',
								only_field_2: 'plep',
							};
						}
					}
					CustomView.allowed_methods = ['get'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const get = view.process_middleware();

					const request = new Request();
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.have.property('only_field');
						expect(res.body).to.not.have.property('only_field_2');
						done();
					});
					get(request, response, response.next);
				});

				it('Adds computed fields', done => {
					class Serializer extends BaseSerializer {
						get_field_2(json) {
							return json.only_field * 2;
						}
					}
					Serializer.fields = {
						only_field: new Fields.Number({ required: true }),
						field_2: new Fields.Number({ required: false })
					};

					class CustomView extends BaseView {
						get() {
							return {
								only_field: 45,
							};
						}
					}
					CustomView.allowed_methods = ['get'];
					CustomView.SerializerClass = Serializer;

					const view = new CustomView();
					const get = view.process_middleware();

					const request = new Request();
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.have.property('only_field');
						expect(res.body).to.have.property('field_2');
						expect(res.body.field_2).to.be.eql(90);
						done();
					});
					get(request, response, response.next);
				});

				it('Returns raw response because no serializer (default)', done => {
					class CustomView extends BaseView {
						get() {
							return {
								only_field: 45,
							};
						}
					}
					CustomView.allowed_methods = ['get'];

					const view = new CustomView();
					const get = view.process_middleware();

					const request = new Request();
					const response = new Response();

					response.on('error', (e) => done(e));

					response.on('response', (res) => {
						expect(res.status_code).to.be.eql(200);
						expect(res.body).to.have.property('only_field');
						done();
					});
					get(request, response, response.next);
				});
			});
		});
	});
});

const { expect } = require('chai');
const Crypto = require('crypto');

const ModelView = require('../../lib/view');
const Mongo = require('./utils/db');
const { Model, Fields } = require('@jsmrcaga/executor');
const { Request, Response } = require('../../testing/http');

const View = require('../../lib/view');
const { GenericSerializer } = require('../../lib/serializers/serializers');

class NoSchemaModel extends Model {}
NoSchemaModel.ALLOW_EXTRA_FIELDS = true;

class SchemaModel extends Model {}
SchemaModel.VALIDATION_SCHEMA = {
	uuid: new Fields.PrimaryKey({ defaultValue: Crypto.randomUUID }),
	fieldA: new Fields.String({ blank: true, nullable: true, defaultValue: null }),
	fieldB: new Fields.String({ blank: true, nullable: false, choices: ['choice-a', 'choice-b'] }),
};

class SchemaSerializer extends GenericSerializer {}
SchemaSerializer.available_fields = ['uuid', 'fieldB'];

class NoSchemaView extends View {}
NoSchemaView.Model = NoSchemaModel;

class SchemaView extends View {}
SchemaView.Model = SchemaModel;
SchemaView.SerializerClass = SchemaSerializer;

describe('Model View', () => {
	before(done => {
		Mongo.connect().then(() => done()).catch(e => done(e));
	});

	const n1 = new NoSchemaModel({ randA: 'rand' });
	const n2 = new NoSchemaModel({ randB: 'rand-2' });
	const s1 = new SchemaModel({ fieldB: 'choice-a' });
	const s2 = new SchemaModel({ fieldB: 'choice-b' });

	beforeEach(done => {
		Mongo.db().clear().then(() => {
			// Create models
			const no_promise = NoSchemaModel.objects.bulk_insert([n1, n2]);
			const s_promise = SchemaModel.objects.bulk_insert([s1, s2]);

			return Promise.all([no_promise, s_promise]);
		}).then(() => {
			done();
		}).catch(e => done(e));
	});

	const no_schema_view = new NoSchemaView();
	const schema_view = new SchemaView();

	describe('Retrieve', () => {
		describe('Detail', () => {
			const schema_lookup = schema_view.get_lookup_path();
			const [schema_detail] = schema_view.controller().find('get', schema_lookup);
			const [schema_middleware] = schema_view.controller().find('use', schema_lookup);

			it('Should fetch an object using the lookup middleware', done => {
				const request = new Request({
					method: 'get',
					params: {
						schemamodel_id: s1.pk
					}
				});

				// We need to fake the use method
				const response = new Response();

				response.on('response', response => {
					expect(request['schemamodel']).to.not.be.undefined;
					expect(request['schemamodel'].pk).to.be.eql(s1.pk);
					done();
				});

				response.on('error', err => done(err));

				schema_middleware(request, response, response.next);
			});

			it('Should get a single object (serialized)', done => {
				const request = new Request({
					method: 'get',
					params: {
						schemamodel_id: s1.pk
					}
				});

				// We need to fake the use method
				request[schema_view.get_instance_name()] = s1;
				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					expect(Array.isArray(response.body)).to.be.false;
					expect(response.body).to.be.instanceof(Object);
					expect(response.body.fieldB).to.be.eql('choice-a');
					expect(response.body).to.not.have.property('_id');
					done();
				});

				response.on('error', err => done(err));

				schema_detail(request, response, response.next);
			});
		});

		describe('List', () => {
			// get list
			const [no_schema_list] = no_schema_view.controller().find('get', '/');
			const [schema_list] = schema_view.controller().find('get', '/');
			it('Should get a list of objects', done => {
				const request = new Request({ method: 'get' });
				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					expect(Array.isArray(response.body)).to.be.true;
					expect(response.body).to.have.length(2);
					const ids = response.body.map(b => b._id);
					expect(ids[0]).to.not.be.eql(ids[1]);
					done();
				});

				response.on('error', err => done(err));

				no_schema_list(request, response, response.next);
			});

			it('Should get one object because of page size', done => {
				const request = new Request({ method: 'get', query: { limit: 1 }});
				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					expect(Array.isArray(response.body)).to.be.true;
					expect(response.body).to.have.length(1);
					done();
				});

				response.on('error', err => done(err));

				no_schema_list(request, response, response.next);
			});

			it('Should get a serialized list of objects', done => {
				const request = new Request({ method: 'get' });
				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					expect(Array.isArray(response.body)).to.be.true;
					expect(response.body).to.have.length(2);

					for(const item of response.body) {
						expect(item).to.not.have.property('_id');
						expect(item).to.not.have.property('fieldA');
						expect(item).to.not.have.property('__created');
					}
					done();
				});

				response.on('error', err => done(err));

				schema_list(request, response, response.next);
			});
		});
	});

	describe('Create', () => {
		const [schema_create_route] = schema_view.controller().find('post', '/');
		const [no_schema_create_route] = no_schema_view.controller().find('post', '/');

		it('Should create an object without serialization', done => {
			const request = new Request({
				method: 'post',
				body: {
					key1: 'plep',
					key2: 'plop',
				}
			});

			const response = new Response();

			response.on('response', response => {
				expect(response.status_code).to.be.eql(201);
				NoSchemaModel.objects.get({ _id: response.body._id }).then(object => {
					expect(object).to.have.property('key1');
					expect(object.key1).to.be.eql('plep');
					expect(object).to.have.property('key2');
					expect(object.key2).to.be.eql('plop');
					done();
				}).catch(e => done(e));
			});

			response.on('error', err => done(err));

			no_schema_create_route(request, response, response.next);
		});

		it('Should create multiple objects without serialization', done => {
			const request = new Request({
				method: 'post',
				body: [{
					key1: 'plep',
				}, {
					key2: 'plop',
				}, {
					key3: 'plip',
				}]
			});

			const response = new Response();

			response.on('response', response => {
				expect(response.status_code).to.be.eql(201);
				NoSchemaModel.objects.filter().done().then(objects => {
					const o1 = objects.find(o => o.key1 === 'plep');
					expect(o1).to.not.be.null;
					const o2 = objects.find(o => o.key1 === 'plop');
					expect(o2).to.not.be.null;
					const o3 = objects.find(o => o.key1 === 'plip');
					expect(o3).to.not.be.null;
					done();
				}).catch(e => done(e));
			});

			response.on('error', err => done(err));

			no_schema_create_route(request, response, response.next);
		});

		for(const body of [
			// These are valid because ignored by serializer
			// { k1: 'plep' },
			// { fieldA: 'plep' },
			{ fieldB: 'choice-c' }
		]) {
			it(`Should respond 400 because of invalid data - ${JSON.stringify(body)}`, done => {
				const request = new Request({
					method: 'post',
					body
				});

				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(400);
					SchemaModel.objects.filter().done().then(models => {
						expect(models).to.have.length(2);
						done();
					}).catch(e => done(e));
				});

				response.on('error', err => done(err));

				schema_create_route(request, response, response.next);
			});
		}

		it(`Should create a serialized object`, done => {
			const request = new Request({
				method: 'post',
				body: {
					fieldB: 'choice-a',
					random_ignored_key: 'plep'
				}
			});

			const response = new Response();

			response.on('response', response => {
				expect(response.status_code).to.be.eql(201);
				SchemaModel.objects.filter().done().then(models => {
					expect(models).to.have.length(3);
					const obj = models.find(({ uuid }) => uuid === response.body.uuid);
					expect(obj.fieldB).to.be.eql('choice-a');
					done();
				}).catch(e => done(e));
			});

			response.on('error', err => done(err));

			schema_create_route(request, response, response.next);
		});
	});

	describe('Update', () => {
		describe('Single object', () => {
			const schema_lookup = schema_view.get_lookup_path();
			const [schema_update_route] = schema_view.controller().find('patch', schema_lookup);
			const no_lookup = no_schema_view.get_lookup_path();
			const [no_schema_update_route] = no_schema_view.controller().find('patch', no_lookup);

			it('Should update an object without serialization', done => {
				const request = new Request({
					method: 'patch',
					params: {
						noschemamodel_id: n1.pk
					},
					body: {
						key1: 'plep',
						key2: 'plop',
					}
				});

				request['noschemamodel'] = n1;

				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					NoSchemaModel.objects.get({ _id: response.body._id }).then(object => {
						expect(object).to.have.property('key1');
						expect(object.key1).to.be.eql('plep');
						expect(object).to.have.property('key2');
						expect(object.key2).to.be.eql('plop');
						done();
					}).catch(e => done(e));
				});

				response.on('error', err => done(err));

				no_schema_update_route(request, response, response.next);
			});

			for(const body of [
				// These are valid because ignored by serializer
				// { k1: 'plep' },
				// { fieldA: 'plep' },
				{ fieldB: 'choice-c' }
			]) {
				it(`Should respond 400 because of invalid data - ${JSON.stringify(body)}`, done => {
					const request = new Request({
						method: 'patch',
						body,
						params: {
							'schemamodel_id': s1.pk
						}
					});

					request['schemamodel'] = s1;

					const response = new Response();

					response.on('response', response => {
						expect(response.status_code).to.be.eql(400);
						SchemaModel.objects.get({ uuid: s1.uuid }).then(schema => {
							expect(schema.fieldB).to.be.eql('choice-a');
							done();
						}).catch(e => done(e));
					});

					response.on('error', err => done(err));

					schema_update_route(request, response, response.next);
				});
			}

			it(`Should update a serialized object`, done => {
				const request = new Request({
					method: 'patch',
					body: {
						fieldB: 'choice-b',
						random_ignored_key: 'plep'
					},
					params: {
						'schemamodel_id': s1.pk
					}
				});

				request['schemamodel'] = s1;
				// Verify that it changed
				expect(s1.fieldB).to.be.eql('choice-a');

				const response = new Response();

				response.on('response', response => {
					expect(response.status_code).to.be.eql(200);
					SchemaModel.objects.get({ uuid: s1.uuid }).then(schema => {
						expect(schema.fieldB).to.be.eql('choice-b');
						done();
					}).catch(e => done(e));
				});

				response.on('error', err => done(err));

				schema_update_route(request, response, response.next);
			});
		});
	});

	describe('Delete', () => {
		const schema_lookup = schema_view.get_lookup_path();
		const [schema_delete_one] = schema_view.controller().find('delete', schema_lookup);
		const [schema_delete_many] = schema_view.controller().find('delete', '/');

		it('Should delete a single object', done => {
			const request = new Request({
				method: 'delete',
				params: {
					schemamodel_id: s1.pk
				}
			});

			request['schemamodel'] = s1;
			expect(s1.__deleted).to.be.null;

			const response = new Response();

			response.on('response', response => {
				expect(response.status_code).to.be.eql(204);
				SchemaModel.objects.get({ uuid: s1.uuid }).then(object => {
					expect(s1.__deleted).to.not.be.null;
					expect(Number.isNaN(new Date(s1.__deleted).getTime())).to.be.false;
					done();
				}).catch(e => done(e));
			});

			response.on('error', err => done(err));

			schema_delete_one(request, response, response.next);
		});

		it(`Should delete multiple objects by ids`, done => {
			const request = new Request({
				method: 'delete',
				body: [s1, s2].map(o => o.pk),
			});

			const response = new Response();

			response.on('response', response => {
				expect(response.status_code).to.be.eql(204);
				SchemaModel.objects.filter().done().then(objects => {
					for(const obj of objects) {
						expect(obj.__deleted).to.not.be.null;
						expect(Number.isNaN(new Date(obj.__deleted).getTime())).to.be.false;
					}
					done();
				}).catch(e => done(e));
			});

			response.on('error', err => done(err));

			// Make sure every object is not deleted
			SchemaModel.objects.filter().update({
				__deleted: null
			}).then(() => {
				return SchemaModel.objects.filter().done();
			}).then(objects => {
				for(const obj of objects) {
					expect(obj.__deleted).to.be.null;
				}
				schema_delete_many(request, response, response.next);
			}).catch(e => done(e));
		});
	});
});

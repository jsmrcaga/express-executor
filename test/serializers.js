const { expect } = require('chai');

const { DeserializationError } = require('../lib/errors');
const { GenericSerializer } = require('../lib/serializers/serializers');
const { Model, Fields } = require('@jsmrcaga/executor');

class CustomModel extends Model {}
CustomModel.VALIDATION_SCHEMA = {
	string_field: new Fields.String({ required: true }),
	not_required_field: new Fields.String({ required: false }),
	int_field: new Fields.Integer({ required: true })
};

describe('Model Serializer', () => {
	describe('Serialization', () => {
		it('Serializes a model correctly', () => {
			const model = new CustomModel({
				string_field: 'pelp',
				int_field: 63452,
			});

			serializer = new GenericSerializer({
				Model: CustomModel,
				instance: model
			});

			const serialized = serializer.serialize();
			expect(serialized).to.be.an.instanceof(Object);
			expect(serialized).to.have.property('string_field');
			expect(serialized).to.have.property('int_field');

			expect(serialized.string_field).to.be.eql(model.string_field);
			expect(serialized.int_field).to.be.eql(model.int_field);
		});

		it('Serializes a model without a field', () => {
			const model = new CustomModel({
				string_field: 'pelp',
				int_field: 63452,
			});

			class CustomSerializer extends GenericSerializer {}
			CustomSerializer.available_fields = ['string_field'];

			serializer = new CustomSerializer({
				Model: CustomModel,
				instance: model
			});

			const serialized = serializer.serialize();
			expect(serialized).to.be.an.instanceof(Object);
			expect(serialized).to.have.property('string_field');
			expect(serialized).to.not.have.property('int_field');
			expect(Object.keys(serialized)).to.have.length(1);
		});

		it('Serializes a model with a getter', () => {
			const model = new CustomModel({
				string_field: 'pelp',
				int_field: 63452,
			});

			class CustomSerializer extends GenericSerializer {
				get_int_field(values) {
					return values.int_field * 2;
				}
			}

			serializer = new CustomSerializer({
				Model: CustomModel,
				instance: model
			});

			const serialized = serializer.serialize();
			expect(serialized).to.be.an.instanceof(Object);
			expect(serialized).to.have.property('string_field');
			expect(serialized).to.have.property('int_field');
			expect(serialized.int_field).to.be.eql(model.int_field * 2);
		});
	});

	describe('Deserialization', () => {
		it('Asks for missing required fields', () => {
			serializer = new GenericSerializer({
				Model: CustomModel,
				data: {
					not_required_field: 'plep'
				}
			});

			expect(() => serializer.deserialize()).to.throw(DeserializationError);
			try {
				serializer.deserialize();
			} catch(e) {
				expect(Object.keys(e.body).length).to.be.eql(2);
				expect(Object.keys(e.errors).length).to.be.eql(2);
				for(const error of Object.values(e.errors)) {
					expect(/Required value/.test(error)).to.be.true;
				}
			}
		});

		it('Indicates a mistyped field', () => {
			serializer = new GenericSerializer({
				Model: CustomModel,
				data: {
					string_field: 'plep',
					int_field: 'plepleple'
				}
			});

			expect(() => serializer.deserialize()).to.throw(DeserializationError);
			try {
				serializer.deserialize();
			} catch(e) {
				expect(Object.keys(e.errors).length).to.be.eql(1);
				expect(e.errors.int_field).to.match(/Invalid value/);
			}
		});

		it('Deserializes correctly', () => {
			serializer = new GenericSerializer({
				Model: CustomModel,
				data: {
					string_field: 'plep',
					int_field: 45,
				}
			});

			expect(() => serializer.deserialize()).not.to.throw(DeserializationError);
			const value = serializer.deserialize();
			expect(value).to.have.property('string_field');
			expect(value).to.have.property('int_field');
		});
	});
});

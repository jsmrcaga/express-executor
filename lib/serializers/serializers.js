const { SerializationError, DeserializationError } = require('../errors');

class BaseSerializer {
	constructor({ data=null, instance=null, many=false, partial=false } = {}) {
		this.data = data;
		this.instance = instance;
		this.many = many;
		this.partial = partial;
	}

	get availabe_fields_list() {
		if(!this.constructor.fields) {
			return null;
		}

		return Object.keys(this.constructor.fields);
	}

	get fields() {
		return this.constructor.fields;
	}

	serialize_instance(instance) {
		if(!(instance instanceof Object)) {
			return instance;
		}

		const available_fields = this.availabe_fields_list;
		let json = {...instance};
		if (instance.toJSON) {
			// We proxy call because we return a different object
			json = instance.toJSON();
		}

		if (!available_fields) {
			return json;
		}

		const ret = {};
		for (const field of available_fields) {
			if(this[`get_${field}`]) {
				ret[field] = this[`get_${field}`](json);
			} else {
				ret[field] = json[field];
			}
		}

		return ret;
	}

	serialize() {
		if (!this.instance) {
			throw new Error('Instance needed to serialize');
		}

		// From Model to JSON
		if (this.many) {
			if (!Array.isArray(this.instance)) {
				throw new SerializationError('Serializer instanciated with \'many\' but instance is not an array');
			}

			return this.instance.map(i => this.serialize_instance(i));
		}

		if (Array.isArray(this.instance)) {
			throw new SerializationError('Serializer instanciated with many=false but instance is an array');
		}

		return this.serialize_instance(this.instance);
	}

	deserialize_one(item) {
		let valid_data = {};

		if (this.fields) {
			for (const valid_field of this.availabe_fields_list) {
				if(valid_field in item) {
					valid_data[valid_field] = item[valid_field];
				}
			}
		} else {
			valid_data = {...item};
		}

		if (this.fields) {
			const errors = {};
			for (const [key, field] of Object.entries(this.fields)) {
				if (!(key in valid_data) && this.partial) {
					// If serializer is partial we accept missing keys
					continue;
				}

				try {
					field.is_valid(valid_data[key], key, valid_data);
				} catch (e) {
					errors[key] = e.message;
				}
			}

			if (Object.keys(errors).length) {
				throw new DeserializationError('Error deserializing', errors);
			}
		}

		return valid_data;
	}

	deserialize() {
		// From JSON to Model-ready data
		if (!this.data) {
			throw new Error('Data needed to deserialize');
		}

		if (Array.isArray(this.data) && !this.many) {
			throw new Error('Cannot deserialize array because initialized with many=false');
		}

		if (Array.isArray(this.data)) {
			return this.data.map(item => this.deserialize_one(item));
		}

		return this.deserialize_one(this.data);
	}
}

BaseSerializer.fields = null;

class GenericSerializer extends BaseSerializer {
	constructor({ Model, ...rest} = {}) {
		super(rest);
		this.Model = Model;

		if (!this.Model) {
			throw new Error('Model needed to create serializer');
		}
	}

	get availabe_fields_list() {
		// .fields is for retrocompatibilty
		// should be removed soon
		return this.constructor.available_fields || this.constructor.fields;
	}

	get fields() {
		return this.Model.VALIDATION_SCHEMA;
	}

	serialize() {
		if (!this.instance) {
			throw new Error('Instance needed to serialize');
		}

		if (!(this.instance instanceof this.Model)) {
			throw new SerializationError(`Object must be an instance of ${this.Model.name}`);
		}

		return super.serialize();
	}

	deserialize_one(item) {
		if (!this.Model.ALLOW_EXTRA_FIELDS) {
			// Check if model allows extra fields, throw for 400
			const model_fields = Object.keys(this.Model.VALIDATION_SCHEMA);
			for (const k in item) {
				if (!(k in model_fields)) {
					throw new DeserializationError('Error deserializing extra fields', { [k]: `Field ${k} not recognized for model ${this.Model.name}` });
				}
			}
		}

		const valid_data = super.deserialize_one(item);

		// Remove Mongo's _id
		if (valid_data._id) {
			delete valid_data._id;
		}

		return valid_data;
	}
}

// Allow all fields
GenericSerializer.available_fields = null;

module.exports = {
	DeserializationError,
	SerializationError,
	BaseSerializer,
	GenericSerializer
};

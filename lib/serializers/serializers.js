class SerializationError extends Error {}
class DeserializationError extends Error {
	constructor(message, errors) {
		super(message);
		this.message = message;
		this.errors = errors;
	}
}

class GenericSerializer {
	constructor({ Model, data = null, instance = null, many = false, partial = false } = {}) {
		this.Model = Model;
		this.data = data;
		this.instance = instance;
		this.many = many;
		this.partial = partial;

		if (!this.Model) {
			throw new Error('Model needed to create serializer');
		}
	}

	serialize_instance(instance) {
		const available_fields = this.constructor.fields;
		let json = instance;
		if (instance.toJSON) {
			// We proxy call because we return a different object
			json = instance.toJSON();
		}

		if (!available_fields) {
			return json;
		}

		const ret = {};
		for (const field of available_fields) {
			ret[field] = json[field];
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

			if (!this.instance.every(i => i instanceof this.Model)) {
				throw new SerializationError(`Every object in serialization array must be an instance of ${this.Model.name}`); ;
			}

			return this.instance.map(i => this.serialize_instance(i));
		}

		if (Array.isArray(this.instance)) {
			throw new SerializationError('Serializer instanciated with many=false but instance is an array');
		}

		if (!(this.instance instanceof this.Model)) {
			throw new SerializationError(`Object must be an instance of ${this.Model.name}`);
		}

		return this.serialize_instance(this.instance);
	}

	deserialize_one(item) {
		const available_fields = this.constructor.fields;

		let valid_data = {};

		if (!this.Model.ALLOW_EXTRA_FIELDS) {
			// Check if model allows extra fields, throw for 400
			const model_fields = Object.keys(this.Model.VALIDATION_SCHEMA);
			for (const k in item) {
				if (!(k in model_fields)) {
					throw new DeserializationError('Error deserializing extra fields', { [k]: `Field ${k} not recognized for model ${this.Model.name}` });
				}
			}
		}

		if (available_fields) {
			for (const valid_field of available_fields) {
				valid_data[valid_field] = item[valid_field];
			}
		} else {
			valid_data = item;
		}

		if (this.Model.VALIDATION_SCHEMA) {
			const errors = {};
			for (const [key, field] of Object.entries(this.Model.VALIDATION_SCHEMA)) {
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

		// Remove Mongo's _id
		if (valid_data._id) {
			delete valid_data._id;
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

// Allow all fields
GenericSerializer.fields = null;

module.exports = {
	DeserializationError,
	SerializationError,
	GenericSerializer
};

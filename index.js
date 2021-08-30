const Controller = require('./lib/controller');
const View = require('./lib/view');
const { auth: Auth, Authorization } = require('./lib/middleware/authorization');
const { Token, Tokens, TokenGenerator } = require('./lib/token');
const { GenericSerializer, DeserializationError, SerializationError } = require('./lib/serializers/serializers');

const Utils = require('./lib/utils');

module.exports = {
	Controller,
	View,
	Token,
	Tokens,
	TokenGenerator,
	Authorization,
	Auth,
	Utils,
	GenericSerializer,
	DeserializationError,
	SerializationError
};

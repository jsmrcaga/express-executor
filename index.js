const Controller = require('./lib/controller');
const View = require('./lib/view');
const BaseView = require('./lib/views/view');
const { Authorization } = require('./lib/middleware/authorization');
const { Token, tokens, TokenGenerator } = require('./lib/token');
const { GenericSerializer, BaseSerializer } = require('./lib/serializers/serializers');
const Errors = require('./lib/errors');

const Utils = require('./lib/utils');

module.exports = {
	Controller,
	BaseView,
	View,
	Token,
	tokens,
	TokenGenerator,
	Authorization,
	Utils,
	BaseSerializer,
	GenericSerializer,
	Errors
};

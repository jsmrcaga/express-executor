const { Mongo } = require('@jsmrcaga/executor');

Mongo.config({
	connection: {
		username: 'expressexec',
		password: 'expressexec',
		protocol: 'mongodb',
		host: 'db',
		port: 27017,
		query: { authSource: 'admin' },
		database: 'expressexec'
	},
	options: {
		useUnifiedTopology: true
	}
});

module.exports = Mongo;

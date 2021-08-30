const { expect } = require('chai');
// No need for more, just test that everything is imported correctly
const _exports = require('../index');

describe('Exports', () => {
	it(`Should export every key`, () => {
		for(const [k, v] of Object.entries(_exports)) {
			expect(_exports[k]).not.to.be.undefined;
			expect(v).not.to.be.undefined;
		}
	});
});

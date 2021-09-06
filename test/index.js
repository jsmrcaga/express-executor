const { expect } = require('chai');
// No need for more, just test that everything is imported correctly
const _exports = require('../index');

describe('Exports', () => {
	for(const [k, v] of Object.entries(_exports)) {
		it(`Should export ${k}`, () => {
			expect(_exports[k]).not.to.be.undefined;
			expect(v).not.to.be.undefined;
		});
	}
});

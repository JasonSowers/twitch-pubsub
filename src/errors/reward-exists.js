/**
 * 
 * @param {*} reward the existing reward object
 * @param {*} message the message about the the error
 * @param {*} fileName (stracktrace stuff)
 * @param {*} lineNumber (stracktrace stuff)
 */
function RewardExistsError(reward, message, fileName, lineNumber) {
	var instance = new Error(message, fileName, lineNumber);
	instance.name = 'RewardExistsError';
	instance.reward = reward;
	Object.setPrototypeOf(instance, Object.getPrototypeOf(this));
	if (Error.captureStackTrace) {
		Error.captureStackTrace(instance, RewardExistsError);
	}
	return instance;
}

RewardExistsError.prototype = Object.create(Error.prototype, {
	constructor: {
		value: Error,
		enumerable: false,
		writable: true,
		configurable: true
	}
});

if (Object.setPrototypeOf) {
	Object.setPrototypeOf(RewardExistsError, Error);
} else {
	RewardExistsError.__proto__ = Error;
}
/*
try {
	throw new RewardExistsError('baz', 'bazMessage');
} catch (e) {
	console.error(e.name); //RewardExistsError
	console.error(e.reward); //baz
	console.error(e.message); //bazMessage
}
*/
module.exports = RewardExistsError;
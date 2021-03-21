/**
 * 
 * @param {*} status the status code of the unauthorized response
 * @param {*} message the message about the the error
 * @param {*} fileName (stracktrace stuff)
 * @param {*} lineNumber (stracktrace stuff)
 */
function UnauthorizedError(status, message, fileName, lineNumber) {
	var instance = new Error(message, fileName, lineNumber);
	instance.name = 'UnauthorizedError';
	instance.status = status;
	Object.setPrototypeOf(instance, Object.getPrototypeOf(this));
	if (Error.captureStackTrace) {
		Error.captureStackTrace(instance, UnauthorizedError);
	}
	return instance;
}

UnauthorizedError.prototype = Object.create(Error.prototype, {
	constructor: {
		value: Error,
		enumerable: false,
		writable: true,
		configurable: true
	}
});

if (Object.setPrototypeOf) {
	Object.setPrototypeOf(UnauthorizedError, Error);
} else {
	UnauthorizedError.__proto__ = Error;
}

module.exports = UnauthorizedError;
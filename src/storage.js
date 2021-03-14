/*

*/

const azure = require('azure-storage');

const tableSvc = azure.createTableService();

const tableNameBroadcasters = 'testBroadcastersTable';
const partitionBroadcasters = 'testnBroadcasters';

const tableNameRedemptions = 'testRedemptionsTable';
const partitionRedemptions = 'testRedemptions';

function newBroadcasterEntity({ channel_id, refresh_token, reward_id, enable_card }) {
	return {
		PartitionKey: { '_': partitionBroadcasters },
		RowKey: { '_': channel_id },
		refresh_token: { '_': refresh_token },
		reward_id: { '_': reward_id },
		enable_card: { '_': enable_card }
	};
}

function newRedemptionEntity({ channel_id, reward_id, redemption_id }) {
	return {
		PartitionKey: { '_': partitionRedemptions },
		RowKey: { '_': redemption_id },
		channel_id: { '_': channel_id },
		reward_id: { '_': reward_id }
	};
}

async function insertRedemption(item) {
	const task = newRedemptionEntity(item);

	const insertRedemption = await new Promise(resolve => {
		tableSvc.insertEntity(tableNameRedemptions, task, function (error, result, response) {
			resolve({ error, result, response });
		});
	});
	console.log({ insertRedemption });
	return insertRedemption;
}

async function insertBroadcaster({ channel_id, refresh_token, reward_id }) {

	// const channel_id = '987654321';
	// const refresh_token = 'asdfghjklzxcvbnmqwertyuiop';
	// const reward_id = 'q1w2e3r4t5y6u7i8o9p';

	const task = newBroadcasterEntity({ channel_id, refresh_token, reward_id, enable_card: true });

	const insertBroadcaster = await new Promise(resolve => {
		tableSvc.insertEntity(tableNameBroadcasters, task, function (error, result, response) {
			resolve({ error, result, response });
		});
	});
	console.log({ insertBroadcaster });
	return insertBroadcaster;
}

async function getBroadcasterEntry(channel_id) {
	const retrieveResult = await new Promise(resolve => {
		tableSvc.retrieveEntity(tableNameBroadcasters, partitionBroadcasters, channel_id, function (error, result, response) {
			resolve({ error, result, response });
		});
	});
	console.log({ retrieveResult });
	return retrieveResult;
}

function getBroadcasterEntries(entriesCallback) {

	var query = new azure.TableQuery()
		.where('PartitionKey eq ?', partitionBroadcasters);

	var nextContinuationToken = null;
	tableSvc.queryEntities(tableNameBroadcasters,
		query,
		nextContinuationToken,
		function (error, results) {
			if (error) throw error;

			// iterate through results.entries with results
			entriesCallback(results.entries);
			if (results.continuationToken) {
				nextContinuationToken = results.continuationToken;
			}

		});
}

async function connect() {

	const createBroadcastersTableResult = await new Promise(resolve => {
		tableSvc.createTableIfNotExists(tableNameBroadcasters, function (error, result, response) {
			resolve({ error, result, response });
		});
	});

	const createRedemptionsTableResult = await new Promise(resolve => {
		tableSvc.createTableIfNotExists(tableNameRedemptions, function (error, result, response) {
			resolve({ error, result, response });
		});
	});
	console.log({ createBroadcastersTableResult, createRedemptionsTableResult });
}

module.exports = {
	connect,
	getBroadcasterEntry,
	getBroadcasterEntries,
	insertBroadcaster,
	insertRedemption
}
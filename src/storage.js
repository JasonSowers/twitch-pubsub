/*

*/

const azure = require('azure-storage');

const tableSvc = azure.createTableService();

const tableNameBroadcasters = 'testBroadcastersTable';
const partitionBroadcasters = 'testBroadcasters';

const tableNameRedemptions = 'testRedemptionsTable';
const partitionRedemptions = 'testRedemptions';

function entityMapBroadcaster(entity) {
	return {
		channel_id: entity.RowKey._,
		refresh_token: entity.refresh_token._,
		reward_id: entity.reward_id._
	};
}

function entityMapRedemption(entity) {
	return {
		redemption_id: entity.RowKey._,
		channel_id: entity.channel_id._,
		reward_id: entity.reward_id._,
	};
}

function insertBroadcasterTask({ channel_id, refresh_token, reward_id }) {
	return {
		PartitionKey: { '_': partitionBroadcasters },
		RowKey: { '_': channel_id },
		refresh_token: { '_': refresh_token },
		reward_id: { '_': reward_id }
	};
}

function insertRedemptionTask({ channel_id, reward_id, redemption_id }) {
	return {
		PartitionKey: { '_': partitionRedemptions },
		RowKey: { '_': redemption_id },
		channel_id: { '_': channel_id },
		reward_id: { '_': reward_id }
	};
}

function deleteBroadcasterTask(channel_id) {
	return {
		PartitionKey: { '_': partitionBroadcasters },
		RowKey: { '_': channel_id }
	};
}

function deleteRedemptionTask(channel_id) {
	return {
		PartitionKey: { '_': partitionRedemptions },
		RowKey: { '_': channel_id }
	};
}

async function insertBroadcasterEntity({ channel_id, refresh_token, reward_id }) {
	return new Promise(resolve => {
		const task = insertBroadcasterTask({ channel_id, refresh_token, reward_id });
		tableSvc.insertEntity(tableNameBroadcasters, task, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}

async function insertRedemptionEntity(item) {
	return new Promise(resolve => {
		const task = insertRedemptionTask(item);
		tableSvc.insertEntity(tableNameRedemptions, task, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}


async function retrieveBroadcasterEntity(channel_id) {
	return new Promise(resolve => {
		tableSvc.retrieveEntity(tableNameBroadcasters, partitionBroadcasters, channel_id, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}

async function deleteBroadcasterEntity(channel_id) {
	return new Promise(resolve => {
		const task = deleteBroadcasterTask(channel_id);
		tableSvc.deleteEntity(tableNameBroadcasters, task, (error, response) => {
			resolve({ error, response });
		});
	});
}

async function deleteRedemptionEntity(channel_id) {
	return new Promise(resolve => {
		const task = deleteRedemptionTask(channel_id);
		tableSvc.deleteEntity(tableNameRedemptions, task, (error, response) => {
			resolve({ error, response });
		});
	});
}

function queryBroadcasterEntries(entriesCallback) {
	/*
			W I P below

	*/
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
	entityMapBroadcaster,
	entityMapRedemption,
	retrieveBroadcasterEntity,
	queryBroadcasterEntries,
	insertBroadcasterEntity,
	insertRedemptionEntity,
	deleteBroadcasterEntity,
	deleteRedemptionEntity
}
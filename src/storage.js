/*

*/

const azure = require('azure-storage');

const tableSvc = azure.createTableService();

const tableNameRewards = 'Rewards';
const partitionRewards = 'Card';

const tableNameRedemptions = 'Redemptions';
const partitionRedemptions = 'Pending';

function entityMapReward(entity) {
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

function insertRewardTask({ channel_id, refresh_token, reward_id }) {
	return {
		PartitionKey: { '_': partitionRewards },
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

function deleteRewardTask(channel_id) {
	return {
		PartitionKey: { '_': partitionRewards },
		RowKey: { '_': channel_id }
	};
}

function deleteRedemptionTask(redemption_id) {
	return {
		PartitionKey: { '_': partitionRedemptions },
		RowKey: { '_': redemption_id }
	};
}

async function insertRewardEntity({ channel_id, refresh_token, reward_id }) {
	return new Promise(resolve => {
		const task = insertRewardTask({ channel_id, refresh_token, reward_id });
		tableSvc.insertEntity(tableNameRewards, task, (error, result, response) => {
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


async function retrieveRewardEntity(channel_id) {
	return new Promise(resolve => {
		tableSvc.retrieveEntity(tableNameRewards, partitionRewards, channel_id, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}

async function deleteRewardEntity(channel_id) {
	return new Promise(resolve => {
		const task = deleteRewardTask(channel_id);
		tableSvc.deleteEntity(tableNameRewards, task, (error, response) => {
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

async function deleteRedemptionEntites(redemption_ids) {
	return new Promise(resolve => {
		const batch = new azure.TableBatch();

		for (let i = 0; i < redemption_ids.length; i++) {
			const redemption_id = redemption_ids[i];
			const task = deleteRedemptionTask(redemption_id);
			batch.deleteEntity(task);
		}
		tableSvc.executeBatch(tableNameRedemptions, batch, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}

function queryRewardEntries(entriesCallback) {
	/*
			W I P below
	*/
	var query = new azure.TableQuery()
		.where('PartitionKey eq ?', partitionRewards);

	var nextContinuationToken = null;
	tableSvc.queryEntities(tableNameRewards,
		query,
		nextContinuationToken,
		function (error, results) {
			if (error) throw error;

			// iterate through results.entries with results
			entriesCallback({ entries: results.entries, continuationToken: results.continuationToken });
			if (results.continuationToken) {
				nextContinuationToken = results.continuationToken;
			}

		});
}
function queryRedemptionEntites(entriesCallback) {
	/*
			W I P below
	*/
	var query = new azure.TableQuery()
		.where('PartitionKey eq ?', partitionRedemptions);

	var nextContinuationToken = null;
	tableSvc.queryEntities(tableNameRedemptions,
		query,
		nextContinuationToken,
		function (error, results) {
			if (error) throw error;

			// iterate through results.entries with results
			entriesCallback({ entries: results.entries, continuationToken: results.continuationToken });
			if (results.continuationToken) {
				nextContinuationToken = results.continuationToken;
			}

		});
}

async function connect() {

	const createRewardsTableResult = await new Promise(resolve => {
		tableSvc.createTableIfNotExists(tableNameRewards, function (error, result, response) {
			resolve({ error, result, response });
		});
	});

	const createRedemptionsTableResult = await new Promise(resolve => {
		tableSvc.createTableIfNotExists(tableNameRedemptions, function (error, result, response) {
			resolve({ error, result, response });
		});
	});
	console.log({ createRewardsTableResult, createRedemptionsTableResult });
}

module.exports = {
	connect,
	entityMapReward,
	entityMapRedemption,
	retrieveRewardEntity,
	queryRewardEntries,
	queryRedemptionEntites,
	insertRewardEntity,
	insertRedemptionEntity,
	deleteRewardEntity,
	deleteRedemptionEntity,
	deleteRedemptionEntites
}
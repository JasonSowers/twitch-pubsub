/*

*/

const azure = require('azure-storage');

const tableSvc = azure.createTableService();

const tableNameUsers = 'Users';

const tableNameRewards = 'Rewards';
const partitionRewards = 'Card';

function entityMapUser(entity) {
	return {
		channel_id: entity.twitch_id._,
		access_token: entity.access_token._,
	};
}

function entityMapReward(entity) {
	return {
		channel_id: entity.RowKey._,
		reward_id: entity.reward_id._,
		title: entity.title._,
	};
}

function insertRewardTask({ channel_id, reward_id, title, prompt, cost }) {
	return {
		PartitionKey: { '_': channel_id },
		RowKey: { '_': reward_id },
		alexa_id: { '_': 'amzn1.ask.account.AHGNXKRBSWFDMU5DR74MHH46NFN6RQZRBNA6O42M7YN5T2NAACZMYW26ODSF3ZCKTKGF5CMWYGTZXDAFU3RQFTRUKAV6VJBWGMEUK45HFZJNDVM5NEPR4NUH3EGQX7ET5HHB7YUH2MUD5DVFGJTUQWJIKKH6N544IYYTC42GRY5OW3YGWKGYWDMK3GLKD2TJFKZGY2PMWFNT7JQ' },
		twitch_id: { '_': channel_id },
		reward_id: { '_': reward_id },
		title: { '_': title },
		cost: { '_': cost },
		prompt: { '_': prompt },
	};
}

function deleteRewardTask(channel_id) {
	return {
		PartitionKey: { '_': partitionRewards },
		RowKey: { '_': channel_id }
	};
}

async function insertRewardEntity({ channel_id, reward_id, title }) {
	return new Promise(resolve => {
		const task = insertRewardTask({ channel_id, reward_id, title });
		tableSvc.insertEntity(tableNameRewards, task, (error, result, response) => {
			resolve({ error, result, response });
		});
	});
}

async function retrieveRewardEntity(channel_id, reward_id) {
	return new Promise(resolve => {
		tableSvc.retrieveEntity(tableNameRewards, channel_id, reward_id, (error, result, response) => {
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

function queryUserEntries(entriesCallback) {
	/*
			W I P below
	*/
	var query = new azure.TableQuery();

	var nextContinuationToken = null;
	tableSvc.queryEntities(tableNameUsers,
		query,
		nextContinuationToken,
		function (error, results) {
			if (error) throw error;

			// iterate through results.entries with results
			try {
				entriesCallback({ entries: results.entries, continuationToken: results.continuationToken });
			} catch (error) {
				console.error(error);
			}
			if (results.continuationToken) {
				nextContinuationToken = results.continuationToken;
			}

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

module.exports = {
	entityMapUser,
	entityMapReward,
	retrieveRewardEntity,
	queryUserEntries,
	queryRewardEntries,
	insertRewardEntity,
	deleteRewardEntity
};
'use strict';

const fs = require('fs'),
      readline = require('readline'),
      {google} = require('googleapis'),
      config=require('config');

class GoogleSheets {

	constructor(config) {
		// If modifying these scopes, delete token.json.
		this.scopes = config.scopes;
		// The file token.json stores the user's access and refresh tokens, and is
		// created automatically when the authorization flow completes for the first
		// time.
		this.tokenPath = config.tokenPath;
		// Get spreadsheet id
		this.spreadsheet = config.spreadsheetId;
		// Load client secrets from a local file.
		const ref=this;
		fs.readFile(config.credentialsPath, (err, content) => {
			if (err) return console.log('Error loading client secret file:', err);
			// Authorize a client with credentials, then call the Google Drive API.
			ref.authorize(JSON.parse(content), ref.listSheets);
		});
	}

	/**
	 * Create an OAuth2 client with the given credentials, and then execute the
	 * given callback function.
	 * @param {Object} credentials The authorization client credentials.
	 * @param {function} callback The callback to call with the authorized client.
	 */
	authorize(credentials, callback) {
		const {client_secret, client_id, redirect_uris} = credentials.web;
		const oAuth2Client = new google.auth.OAuth2(
			  client_id, client_secret, redirect_uris[0]);

		const ref=this;
		// Check if we have previously stored a token.
		fs.readFile(ref.tokenPath, (err, token) => {
			if (err) return ref.getAccessToken(oAuth2Client, callback);
			oAuth2Client.setCredentials(JSON.parse(token));
			callback(oAuth2Client, ref.spreadsheet);
		});
	}

	/**
	 * Get and store new token after prompting for user authorization, and then
	 * execute the given callback with the authorized OAuth2 client.
	 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
	 * @param {getEventsCallback} callback The callback for the authorized client.
	 */
	getAccessToken(oAuth2Client, callback) {
		const ref=this;
		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: ref.scopes
		});
		console.log('Authorize this app by visiting this url:', authUrl);
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question('Enter the code from that page here: ', (code) => {
			rl.close();
			oAuth2Client.getToken(code, (err, token) => {
				if (err) return console.error('Error retrieving access token', err);
				oAuth2Client.setCredentials(token);
				// Store the token to disk for later program executions
				fs.writeFile(ref.tokenPath, JSON.stringify(token), (err) => {
					if (err) return console.error(err);
					console.log('Token stored to', ref.tokenPath);
				});
				callback(oAuth2Client, ref.spreadsheet);
			});
		});
	}

	/**
	 * Lists the names and IDs of up to 10 files.
	 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
	 */
	listSheets(auth, spreadsheetId) {
		const sheets = google.sheets({version: 'v4', auth});
		sheets.spreadsheets.get({
			spreadsheetId: spreadsheetId,
			includeGridData: true,
			ranges: []
		}, (err, res) => {
			if (err) return console.error('The API returned an error: ' + err);
			console.log(JSON.stringify(res.data.sheets, null, 2));
		});
	}
}

module.exports=GoogleSheets;


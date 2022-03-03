const AWS = require('aws-sdk')
const { Feed } = require('feed')
const { Alert } = require('flood-xws-common/caplib')
const { publisher, service } = require('flood-xws-common/constants')
const s3 = new AWS.S3()
const sns = new AWS.SNS()
const ddb = new AWS.DynamoDB.DocumentClient()
const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME
const topicArn = process.env.ALERT_PUBLISHED_TOPIC_ARN

/**
 * Convert an alert to cap. Currently uses the
 * `caplib` library which needs work but is ok for now.
 *  Ultimately we may opt to choose something else.
 *
 * @param {object} alert - the alert model
 */
function buildCapAlert (alert) {
  // Todo: Create valid capxml
  // Extract from this file for testing
  // https://cap-validator.appspot.com/validate

  const sender = publisher.url
  const source = service.description
  const language = 'en-GB'
  const identifier = alert.id
  const code = alert.code
  const event = code + ' 062 Remove Flood Alert EA' // Todo

  const capAlert = new Alert()
  capAlert.identifier = identifier
  capAlert.sender = sender
  capAlert.sent = new Date().toString()
  capAlert.msgType = 'Alert' // alert.cap_msg_type_name
  capAlert.source = source

  // Todo: support multiple infos for Welsh?
  const capInfo = capAlert.addInfo()
  capInfo.language = language
  capInfo.headline = alert.headline
  capInfo.description = alert.body
  capInfo.event = event

  capInfo.addCategory('Geo')
  capInfo.addCategory('Met')
  capInfo.addCategory('Env')

  capInfo.urgency = 'Expected' // alert.cap_urgency_name // Todo
  capInfo.severity = 'Minor' // alert.cap_severity_name // Todo
  capInfo.certainty = 'Likely' // alert.cap_certainty_name // Todo

  // const capArea = capInfo.addArea(areaId)
  // capArea.addGeocode('TargetAreaCode', code)

  // Todo: Add polygon
  // capArea.addPolygon(...)

  const xml = addStylesheet('../assets/alert-style.xsl', capAlert.toXml())

  return xml
}

// Add XSL stylesheet processing instruction
function addStylesheet (href, xml) {
  const declaration = '<?xml version="1.0" encoding="utf-8"?>\n'
  const decExists = xml.includes(declaration)
  const insertIdx = decExists ? declaration.length : 0
  const instruction = `<?xml-stylesheet type="text/xsl" href="${href}"?>\n`

  return xml.substring(0, insertIdx) + instruction + xml.substring(insertIdx)
}

function getDescription (alert) {
  switch (alert.type_id) {
    case 'fa':
      return `Flood alert in force for ${alert.code}`
    case 'fw':
      return `Flood warning in force for ${alert.code}`
    case 'sfw':
      return `Severe flood warning in force for ${alert.code}`
    default:
      return `Flood no longer in force for ${alert.code}`
  }
}

function getRssFeed (alerts) {
  const feed = new Feed({
    id: 'https://www.gov.uk',
    title: service.description,
    description: service.name,
    generator: 'xws',
    link: 'https://www.gov.uk/check-flooding',
    updated: new Date(),
    image: 'assets/xws.png',
    favicon: 'assets/favicon.ico',
    feedLinks: {
      json: 'https://www.gov.uk/json',
      atom: 'https://www.gov.uk/atom'
    },
    author: {
      name: publisher.name,
      link: publisher.url
    }
  })

  alerts.forEach(alert => {
    const description = getDescription(alert)

    const item = {
      id: alert.sk,
      title: alert.headline,
      link: `items/${alert.sk}.xml`,
      description: description,
      content: alert.body,
      date: new Date(alert.updated),
      image: `https://${bucketName}.s3.eu-west-2.amazonaws.com/alerts/assets/alert-types/${alert.type_id}.gif`
    }

    feed.addItem(item)
  })

  return feed
}

async function getRss () {
  // TODO: Page and order
  const params = {
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': 'AD'
    },
    TableName: tableName
  }

  // Get all alerts
  const result = await ddb.query(params).promise()
  const alerts = result.Items

  // Get rss feed
  const feed = getRssFeed(alerts)

  const rss = addStylesheet('./assets/rss-style.xsl', feed.rss2())
  const atom = feed.atom1()

  return { alerts, rss, atom }
}

async function saveFeed () {
  const { alerts, rss, atom } = await getRss()

  const rssResult = await s3.putObject({
    Bucket: bucketName,
    Key: 'alerts/alerts.rss',
    Body: rss,
    ContentType: 'text/xml',
    ACL: 'public-read'
  }).promise()

  const atomResult = await s3.putObject({
    Bucket: bucketName,
    Key: 'alerts/alerts.atom',
    Body: atom,
    ContentType: 'text/xml',
    ACL: 'public-read'
  }).promise()

  const mapper = alert => {
    const { sk: id, code, type_id, headline, body: message, ea_owner_id, ea_area_id, updated } = alert
    const polygon = `https://${bucketName}.s3.eu-west-2.amazonaws.com/target-areas/${code}.json`

    return { id, code, type_id, headline, message, ea_owner_id, ea_area_id, updated, polygon }
  }

  const jsonResult = await s3.putObject({
    Bucket: bucketName,
    Key: 'alerts/alerts.json',
    Body: JSON.stringify(alerts.map(mapper), null, 2),
    ContentType: 'text/json',
    ACL: 'public-read'
  }).promise()

  return { rssResult, atomResult, jsonResult }
}

async function getAlertData (id) {
  return ddb.get({
    Key: {
      pk: 'AD',
      sk: id
    },
    TableName: tableName
  }).promise()
}

async function saveAlert (alert) {
  const cap = buildCapAlert(alert)

  const params = {
    Bucket: bucketName,
    Key: `alerts/items/${alert.id}.xml`,
    Body: cap,
    ContentType: 'text/xml',
    ACL: 'public-read'
  }

  return s3.putObject(params).promise()
}

async function publishAlert (id, code) {
  const message = { id, code }

  return sns.publish({
    Message: JSON.stringify(message),
    MessageAttributes: {
      code: { DataType: 'String', StringValue: code }
    },
    TopicArn: topicArn
  }).promise()
}

module.exports = { saveAlert, saveFeed, getAlertData, publishAlert }

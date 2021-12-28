/* eslint-disable no-console, import/order, camelcase, no-return-assign */
const express = require('express');
const config = require('./config.json');
const { generateAPIKey, hashAPIKey } = require('./util');
const { customers, apiKeys } = require('./mock-db');
const stripe = require('stripe')(config.key);

const app = express();

// Middleware required for Webhook Handler
app.use(
  express.json({
    verify: (req, _res, buffer) => (req.rawBody = buffer),
  }),
);

// Make a call to the API
app.get('/api', async (req, res) => {
  console.log(req.headers);
  const apiKey = req.headers['x-api-key'];
  console.log(`apiKey: ${apiKey}`);

  if (!apiKey) {
    console.log('in bad request code');
    return res.sendStatus(400); // bad request
  }

  const hashedAPIKey = hashAPIKey(apiKey);

  const customerId = apiKeys[hashedAPIKey];
  const customer = customers[customerId];

  if (!customer || !customer.active) {
    return res.sendStatus(403); // not authorized
  }
  // Record usage with Stripe Billing
  const record = await stripe.subscriptionItems.createUsageRecord(
    customer.itemId,
    {
      quantity: 1,
      timestamp: 'now',
      action: 'increment',
    },
  );
  return res.send({ data: 'paid for information', usage: record });
});

// Create a Stripe Checkout Session to create a customer and subscribe them to a plan
app.get('/checkout', async (req, res) => {
  const { url } = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: config.priceId,
      },
    ],
    success_url:
      'http://localhost:8080/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'http://localhost:8080/error',
  });

  return res.redirect(url);
});

// Listen to webhooks from Stripe when important events happen
app.post('/webhook', async (req, res) => {
  let data;
  let eventType;
  // Check if webhook signing is configured.
  const { webhookSecret } = config;

  if (webhookSecret) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    const signature = req.headers['stripe-signature'];

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.log('Webhook signature verification failed.');
      return res.sendStatus(400);
    }

    // Extract the object from the event.
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.json`,
    // retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  switch (eventType) {
    case 'checkout.session.completed': {
      console.log(data);
      // Data included in the event object:
      const customerId = data.object.customer;
      const subscriptionId = data.object.subscription;

      console.log(
        `Customer ${customerId} subscribed to plan ${subscriptionId}`,
      );

      // Get the subscription. The first item is the plan the user subscribed to.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0].id;

      // Generate API key
      const { apiKey, hashedAPIKey } = generateAPIKey();
      console.log(`User's API Key: ${apiKey}`);
      console.log(`Hashed API Key: ${hashedAPIKey}`);

      // Store the API key in your database.
      customers[customerId] = {
        apiKey: hashedAPIKey,
        itemId,
        active: true,
      };
      apiKeys[hashedAPIKey] = customerId;
      break;
    }
    case 'invoice.paid':
      console.log(data);
      break;
    case 'invoice.payment_failed':
      console.log(data);
      break;
    default:
    // Unhandled event type
  }

  return res.sendStatus(200);
});

app.get('/mock/db', async (req, res) => {
  res.send({ apiKeys, customers });
});

app.get('/usage/:customer', async (req, res) => {
  const customerId = req.params.customer;
  const invoice = await stripe.invoices.retrieveUpcoming({
    customer: customerId,
  });

  res.send(invoice);
});

app.get('/success', (req, res) => {
  const { session_id } = req.query;
  res.send({ data: { session_id } });
});

app.get('/error', (req, res) => {
  res.status(500).send('Error at checkout');
});

app.listen(8080, () => console.log('alive on http://localhost:8080'));

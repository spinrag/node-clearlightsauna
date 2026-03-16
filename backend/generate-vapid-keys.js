#!/usr/bin/env node
// Generate VAPID keys for Web Push notifications.
// Run once: node backend/generate-vapid-keys.js
// Then paste the output into your .env file.

const webpush = require('web-push')

const vapidKeys = webpush.generateVAPIDKeys()

console.log('Add these to your .env file:\n')
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`)

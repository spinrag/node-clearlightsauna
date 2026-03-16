// pushSubscription.ts — Web Push subscribe/unsubscribe helpers

const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';
const SOCKET_HOST = import.meta.env.VITE_SOCKET_HOST || 'http://localhost:3000';

function authHeaders(): HeadersInit {
	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${API_TOKEN}`
	};
}

/** Fetch the VAPID public key from the backend */
export async function getVapidPublicKey(): Promise<string | null> {
	try {
		const res = await fetch(`${SOCKET_HOST}/push/vapid-public-key`);
		if (!res.ok) return null;
		const { publicKey } = await res.json();
		return publicKey;
	} catch {
		return null;
	}
}

/** Convert a base64 VAPID key to Uint8Array for the Push API */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

/** Subscribe to push notifications. Returns the PushSubscription or null on failure. */
export async function subscribeToPush(): Promise<PushSubscription | null> {
	const vapidKey = await getVapidPublicKey();
	if (!vapidKey) return null;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vapidKey)
	});

	// Send subscription to backend
	const res = await fetch(`${SOCKET_HOST}/push/subscribe`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify(subscription.toJSON())
	});

	if (!res.ok) {
		await subscription.unsubscribe();
		return null;
	}

	return subscription;
}

/** Update the threshold temperature for a subscription */
export async function setThreshold(
	endpoint: string,
	thresholdTemp: number | null
): Promise<boolean> {
	const res = await fetch(`${SOCKET_HOST}/push/threshold`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ endpoint, threshold_temp: thresholdTemp })
	});
	return res.ok;
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(subscription: PushSubscription): Promise<boolean> {
	const endpoint = subscription.endpoint;

	await fetch(`${SOCKET_HOST}/push/subscribe`, {
		method: 'DELETE',
		headers: authHeaders(),
		body: JSON.stringify({ endpoint })
	});

	await subscription.unsubscribe();
	return true;
}

/** Get the existing push subscription if one exists */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator)) return null;
	// navigator.serviceWorker.ready never resolves if no SW is registered,
	// so bail out early if there's no active or waiting registration.
	const reg = await navigator.serviceWorker.getRegistration();
	if (!reg) return null;
	return reg.pushManager.getSubscription();
}

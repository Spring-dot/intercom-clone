"use client";
import PusherClient from "pusher-js";

let client: PusherClient | undefined;

/** Lazily-created singleton so we don't open a new socket per component mount. */
export function getPusherClient(): PusherClient {
  if (!client) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return client;
}

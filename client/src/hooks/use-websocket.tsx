import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

type WebSocketMessage = {
  type: "TRAIN_UPDATE" | "BOOKING_UPDATE" | "SEAT_AVAILABILITY";
  data: {
    train?: any;
    booking?: any;
    timestamp: string;
  };
};

export function useWebSocket(onMessage: (message: WebSocketMessage) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const { toast } = useToast();

  const connect = useCallback(() => {
    try {
      // Don't try to connect if we already have an active connection
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      // Close existing socket if it's in a closing or closed state
      if (socketRef.current) {
        socketRef.current.close();
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        console.log("WebSocket connected");
        reconnectAttemptsRef.current = 0; // Reset reconnection attempts on successful connection

        toast({
          title: "Connected to real-time updates",
          description: "You'll receive instant updates for train availability.",
        });

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      });

      socket.addEventListener("message", (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessage(message);

          // Show notifications for important updates
          switch (message.type) {
            case "SEAT_AVAILABILITY":
              if (message.data.train) {
                toast({
                  title: "Seat Availability Updated",
                  description: `Available seats for ${message.data.train.name}: ${message.data.train.availableSeats}`,
                });
              }
              break;
            case "BOOKING_UPDATE":
              if (message.data.booking?.train) {
                toast({
                  title: "New Booking Confirmed",
                  description: `Booking confirmed for train ${message.data.booking.train.name}`,
                });
              }
              break;
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      });

      socket.addEventListener("close", (event) => {
        console.log("WebSocket disconnected", event.code, event.reason);

        // Only show toast if it wasn't a normal closure
        if (event.code !== 1000) {
          toast({
            title: "Connection lost",
            description: "Attempting to reconnect...",
            variant: "destructive",
          });
        }

        // Implement exponential backoff for reconnection
        const maxReconnectDelay = 30000; // Maximum delay of 30 seconds
        const baseDelay = 1000; // Start with 1 second
        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttemptsRef.current),
          maxReconnectDelay
        );

        // Only attempt to reconnect if we haven't already scheduled a reconnection
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      });

      socket.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
      });
    } catch (error) {
      console.error("Failed to establish WebSocket connection:", error);
      toast({
        title: "Connection error",
        description: "Failed to connect to real-time updates. Will retry automatically.",
        variant: "destructive",
      });
    }
  }, [onMessage, toast]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounting"); // Normal closure
      }
    };
  }, [connect]);

  // Return the socket ref in case we need to send messages
  return socketRef;
}
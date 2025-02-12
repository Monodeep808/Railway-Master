import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTrainSchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "secret-api-key";

type WebSocketMessage = {
  type: "TRAIN_UPDATE" | "BOOKING_UPDATE" | "SEAT_AVAILABILITY";
  data: any;
};

function validateAdminApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ message: "Invalid API key" });
  }
  next();
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  function broadcastMessage(message: WebSocketMessage) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  async function broadcastTrainUpdate(trainId: number) {
    try {
      const train = await storage.getTrain(trainId);
      if (train) {
        broadcastMessage({
          type: "TRAIN_UPDATE",
          data: {
            train,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error("Broadcast error:", error);
    }
  }

  // WebSocket connection handling
  wss.on("connection", (ws) => {
    console.log("New WebSocket client connected");

    // Send initial heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "SUBSCRIBE_TRAIN") {
          const train = await storage.getTrain(data.trainId);
          if (train) {
            ws.send(JSON.stringify({
              type: "TRAIN_UPDATE",
              data: { train, timestamp: new Date().toISOString() },
            }));
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      clearInterval(heartbeat);
    });

    ws.on("pong", () => {
      // Client is alive
      ws.isAlive = true;
    });
  });

  // Interval to check for stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });


  // Admin routes
  app.post("/api/trains", validateAdminApiKey, async (req, res) => {
    try {
      const trainData = insertTrainSchema.parse(req.body);
      const train = await storage.createTrain(trainData);
      broadcastMessage({
        type: "TRAIN_UPDATE",
        data: { train, timestamp: new Date().toISOString() },
      });
      res.status(201).json(train);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid train data" });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.put("/api/trains/:id/seats", validateAdminApiKey, async (req, res) => {
    try {
      const trainId = parseInt(req.params.id);
      const { totalSeats } = req.body;
      const train = await storage.updateTrainSeats(trainId, totalSeats);
      broadcastMessage({
        type: "SEAT_AVAILABILITY",
        data: { train, timestamp: new Date().toISOString() },
      });
      res.json(train);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User routes
  app.get("/api/trains", async (req, res) => {
    try {
      const { source, destination } = req.query;
      const trains = await storage.searchTrains(source as string, destination as string);
      res.json(trains);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const bookingData = insertBookingSchema.parse(req.body);
      const booking = await storage.createBooking(req.user!.id, bookingData);

      // Broadcast both booking update and seat availability
      const train = await storage.getTrain(bookingData.trainId);
      if (train) {
        broadcastMessage({
          type: "BOOKING_UPDATE",
          data: {
            booking: { ...booking, train },
            timestamp: new Date().toISOString(),
          },
        });
        broadcastMessage({
          type: "SEAT_AVAILABILITY",
          data: { train, timestamp: new Date().toISOString() },
        });
      }

      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid booking data" });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get("/api/bookings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const bookings = await storage.getUserBookings(req.user!.id);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
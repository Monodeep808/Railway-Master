import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const trains = pgTable("trains", {
  id: serial("id").primaryKey(), 
  name: text("name").notNull(),
  source: text("source").notNull(),
  destination: text("destination").notNull(),
  totalSeats: integer("total_seats").notNull(),
  availableSeats: integer("available_seats").notNull(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  trainId: integer("train_id").references(() => trains.id),
  seatNumber: integer("seat_number").notNull(),
  bookingTime: timestamp("booking_time").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTrainSchema = createInsertSchema(trains).pick({
  name: true,
  source: true,
  destination: true,
  totalSeats: true,
  availableSeats: true,
});

export const insertBookingSchema = createInsertSchema(bookings).pick({
  trainId: true,
  seatNumber: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertTrain = z.infer<typeof insertTrainSchema>;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type User = typeof users.$inferSelect;
export type Train = typeof trains.$inferSelect;
export type Booking = typeof bookings.$inferSelect;

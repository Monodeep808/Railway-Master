import { InsertUser, InsertTrain, InsertBooking, User, Train, Booking } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createTrain(train: InsertTrain): Promise<Train>;
  getTrain(id: number): Promise<Train | undefined>;
  updateTrainSeats(id: number, totalSeats: number): Promise<Train>;
  searchTrains(source: string, destination: string): Promise<Train[]>;
  createBooking(userId: number, booking: InsertBooking): Promise<Booking>;
  getUserBookings(userId: number): Promise<(Booking & { train: Train })[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private trains: Map<number, Train>;
  private bookings: Map<number, Booking>;
  sessionStore: session.Store;
  private currentUserId: number;
  private currentTrainId: number;
  private currentBookingId: number;

  constructor() {
    this.users = new Map();
    this.trains = new Map();
    this.bookings = new Map();
    this.currentUserId = 1;
    this.currentTrainId = 1;
    this.currentBookingId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id, isAdmin: false };
    this.users.set(id, user);
    return user;
  }

  async createTrain(insertTrain: InsertTrain): Promise<Train> {
    const id = this.currentTrainId++;
    const train: Train = { ...insertTrain, id };
    this.trains.set(id, train);
    return train;
  }

  async getTrain(id: number): Promise<Train | undefined> {
    return this.trains.get(id);
  }

  async updateTrainSeats(id: number, totalSeats: number): Promise<Train> {
    const train = this.trains.get(id);
    if (!train) throw new Error("Train not found");

    const updatedTrain = {
      ...train,
      totalSeats,
      availableSeats: totalSeats - (train.totalSeats - train.availableSeats),
    };
    this.trains.set(id, updatedTrain);
    return updatedTrain;
  }

  async searchTrains(source: string, destination: string): Promise<Train[]> {
    const allTrains = Array.from(this.trains.values());
    if (!source && !destination) return allTrains;

    return allTrains.filter(train => {
      const matchesSource = !source || train.source.toLowerCase().includes(source.toLowerCase());
      const matchesDestination = !destination || train.destination.toLowerCase().includes(destination.toLowerCase());
      return matchesSource && matchesDestination;
    });
  }

  async createBooking(userId: number, insertBooking: InsertBooking): Promise<Booking> {
    const { trainId, seatNumber } = insertBooking;
    const train = this.trains.get(trainId);
    if (!train) throw new Error("Train not found");
    if (train.availableSeats <= 0) throw new Error("No seats available");

    // Create the booking
    const id = this.currentBookingId++;
    const booking: Booking = {
      id,
      userId,
      trainId,
      seatNumber,
      bookingTime: new Date(),
    };

    // Update available seats
    const updatedTrain = {
      ...train,
      availableSeats: train.availableSeats - 1,
    };
    this.trains.set(trainId, updatedTrain);
    this.bookings.set(id, booking);

    return booking;
  }

  async getUserBookings(userId: number): Promise<(Booking & { train: Train })[]> {
    const userBookings = Array.from(this.bookings.values())
      .filter(booking => booking.userId === userId);

    return userBookings.map(booking => {
      const train = this.trains.get(booking.trainId!);
      if (!train) throw new Error(`Train not found for booking ${booking.id}`);
      return { ...booking, train };
    });
  }
}

export const storage = new MemStorage();
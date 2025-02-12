import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Train as TrainIcon, LogOut, Search, Calendar, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Train, Booking } from "@shared/schema";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");

  const { data: trains = [], isLoading: isLoadingTrains } = useQuery<Train[]>({
    queryKey: ["/api/trains", source, destination],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (source) params.append("source", source);
      if (destination) params.append("destination", destination);
      const res = await fetch(`/api/trains?${params}`);
      if (!res.ok) throw new Error("Failed to fetch trains");
      return res.json();
    },
    enabled: Boolean(source && destination), // Only search when both fields are filled
  });

  const { data: bookings = [], isLoading: isLoadingBookings } = useQuery<(Booking & { train: Train })[]>({
    queryKey: ["/api/bookings"],
    queryFn: async () => {
      const res = await fetch("/api/bookings", { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch bookings");
      return res.json();
    },
    enabled: !!user,
  });

  const bookSeatMutation = useMutation({
    mutationFn: async (trainId: number) => {
      const res = await apiRequest("POST", "/api/bookings", { trainId, seatNumber: 1 });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to book seat");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Success",
        description: "Seat booked successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Booking failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useWebSocket((message) => {
    switch (message.type) {
      case "TRAIN_UPDATE":
      case "SEAT_AVAILABILITY":
        // Update train data in the query cache
        queryClient.setQueryData(["/api/trains", source, destination], (old: Train[] = []) =>
          old.map((t) => (t.id === message.data.train.id ? message.data.train : t))
        );
        break;
      case "BOOKING_UPDATE":
        // Invalidate bookings query to fetch latest data
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        break;
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <TrainIcon className="h-6 w-6" />
            <h1 className="text-xl font-bold">Railway Booking</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => logoutMutation.mutate()}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-primary/5">
            <CardHeader>
              <CardTitle className="text-2xl">Search Trains</CardTitle>
              <CardDescription>Find trains between stations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="source">
                    From Station
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="source"
                      placeholder="Enter source station"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="destination">
                    To Station
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="destination"
                      placeholder="Enter destination station"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/trains"] })}
                    disabled={!source || !destination}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search Trains
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingTrains && source && destination ? (
            <div className="mt-8 text-center text-muted-foreground">
              Searching for trains between {source} and {destination}...
            </div>
          ) : (
            trains.length > 0 && (
              <div className="mt-8 space-y-4">
                <h2 className="text-xl font-semibold">Available Trains</h2>
                {trains.map((train) => (
                  <Card key={train.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold">{train.name}</h3>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{train.source}</span>
                            <span>→</span>
                            <span>{train.destination}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-sm text-muted-foreground">Available Seats</div>
                            <div className="text-2xl font-semibold">{train.availableSeats}</div>
                          </div>
                          <Button
                            className="w-32"
                            disabled={train.availableSeats === 0 || bookSeatMutation.isPending}
                            onClick={() => bookSeatMutation.mutate(train.id)}
                          >
                            {train.availableSeats === 0 ? "Sold Out" : "Book Now"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}

          {trains.length === 0 && source && destination && !isLoadingTrains && (
            <div className="mt-8 text-center text-muted-foreground">
              No trains found between {source} and {destination}
            </div>
          )}

          {bookings.length > 0 && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Your Bookings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex justify-between items-center p-4 bg-muted rounded-lg"
                    >
                      <div>
                        <h4 className="font-semibold">{booking.train.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{booking.train.source} → {booking.train.destination}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Seat: {booking.seatNumber}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Booking Date</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(booking.bookingTime!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
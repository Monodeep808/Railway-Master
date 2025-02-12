import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Train as TrainIcon, LogOut, Plus, Edit } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTrainSchema } from "@shared/schema";
import type { Train, InsertTrain } from "@shared/schema";
import { useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";

// Admin API key should be stored in environment variable in production
const ADMIN_API_KEY = "secret-api-key";

export default function AdminPage() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingTrain, setEditingTrain] = useState<Train | null>(null);

  // Redirect non-admin users
  if (user && !user.isAdmin) {
    setLocation("/");
    return null;
  }

  const { data: trains = [] } = useQuery<Train[]>({
    queryKey: ["/api/trains"],
    queryFn: async () => {
      const res = await fetch("/api/trains");
      return res.json();
    },
  });

  const addTrainForm = useForm<InsertTrain>({
    resolver: zodResolver(insertTrainSchema),
    defaultValues: {
      name: "",
      source: "",
      destination: "",
      totalSeats: 0,
      availableSeats: 0,
    },
  });

  const addTrainMutation = useMutation({
    mutationFn: async (data: InsertTrain) => {
      const res = await apiRequest("POST", "/api/trains", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trains"] });
      toast({
        title: "Success",
        description: "Train added successfully!",
      });
      addTrainForm.reset();
    },
  });

  const updateSeatsMutation = useMutation({
    mutationFn: async ({
      trainId,
      totalSeats,
    }: {
      trainId: number;
      totalSeats: number;
    }) => {
      const res = await apiRequest("PUT", `/api/trains/${trainId}/seats`, { totalSeats });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trains"] });
      toast({
        title: "Success",
        description: "Seats updated successfully!",
      });
      setEditingTrain(null);
    },
  });

  useWebSocket((message) => {
    if (message.type === "TRAIN_UPDATE") {
      queryClient.setQueryData(["/api/trains"], (old: Train[] = []) =>
        old.map((t) => (t.id === message.train.id ? message.train : t))
      );
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <TrainIcon className="h-6 w-6" />
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Manage Trains</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Train
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Train</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={addTrainForm.handleSubmit((data) =>
                  addTrainMutation.mutate(data)
                )}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Train Name</Label>
                  <Input id="name" {...addTrainForm.register("name")} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source Station</Label>
                  <Input
                    id="source"
                    {...addTrainForm.register("source")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination Station</Label>
                  <Input
                    id="destination"
                    {...addTrainForm.register("destination")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalSeats">Total Seats</Label>
                  <Input
                    id="totalSeats"
                    type="number"
                    {...addTrainForm.register("totalSeats", {
                      valueAsNumber: true,
                    })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="availableSeats">Available Seats</Label>
                  <Input
                    id="availableSeats"
                    type="number"
                    {...addTrainForm.register("availableSeats", {
                      valueAsNumber: true,
                    })}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={addTrainMutation.isPending}
                >
                  {addTrainMutation.isPending ? "Adding..." : "Add Train"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {trains.map((train) => (
            <Card key={train.id}>
              <CardHeader>
                <CardTitle>{train.name}</CardTitle>
                <CardDescription>
                  {train.source} → {train.destination}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Seats:</span>
                    <span>{train.totalSeats}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Available Seats:</span>
                    <span>{train.availableSeats}</span>
                  </div>
                  <Dialog
                    open={editingTrain?.id === train.id}
                    onOpenChange={(open) =>
                      setEditingTrain(open ? train : null)
                    }
                  >
                    <DialogTrigger asChild>
                      <Button className="w-full mt-2">
                        <Edit className="h-4 w-4 mr-2" />
                        Update Seats
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Update Total Seats</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="newTotalSeats">New Total Seats</Label>
                          <Input
                            id="newTotalSeats"
                            type="number"
                            defaultValue={train.totalSeats}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (value >= 0) {
                                updateSeatsMutation.mutate({
                                  trainId: train.id,
                                  totalSeats: value,
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
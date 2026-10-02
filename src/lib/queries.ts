import { queryOptions } from "@tanstack/react-query";
import { getFrontDoor, getBooking, getBookingLink, getOffer } from "@/lib/night-owl.functions";

export const frontDoorQuery = queryOptions({
  queryKey: ["front-door"],
  queryFn: () => getFrontDoor(),
  staleTime: 15_000,
});

export const bookingQuery = (bookingId: string) =>
  queryOptions({
    queryKey: ["booking", bookingId],
    queryFn: () => getBooking({ data: { bookingId } }),
  });

export const bookingLinkQuery = (token: string) =>
  queryOptions({
    queryKey: ["booking-link", token],
    queryFn: () => getBookingLink({ data: { token } }),
  });

export const offerQuery = (token: string) =>
  queryOptions({
    queryKey: ["offer", token],
    queryFn: () => getOffer({ data: { token } }),
    refetchInterval: 30_000,
  });

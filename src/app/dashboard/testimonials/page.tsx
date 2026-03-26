"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TestimonialCard } from "@/components/testimonials/TestimonialCard";
import { Star, CheckCircle, XCircle, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

interface Testimonial {
  id: string;
  profile_id: string;
  author_id: string;
  rating: number;
  content: string;
  status: string;
  created_at: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export default function DashboardTestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();

  const fetchTestimonials = async () => {
    try {
      const res = await fetch("/api/testimonials/manage");
      if (res.status === 401) {
        router.push("/login?redirect=/dashboard/testimonials");
        return;
      }
      const data = await res.json();
      setTestimonials(data.testimonials || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTestimonials();
  }, []);

  const handleStatusChange = async (id: string, status: "approved" | "rejected") => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setTestimonials((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t))
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  };

  const filtered =
    filter === "all" ? testimonials : testimonials.filter((t) => t.status === filter);

  const pendingCount = testimonials.filter((t) => t.status === "pending").length;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading testimonials...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 text-yellow-400" />
          Testimonials
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-600 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "pending", "approved", "rejected"] as FilterStatus[]).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "pending" && <Clock className="h-3.5 w-3.5 mr-1" />}
            {s === "approved" && <CheckCircle className="h-3.5 w-3.5 mr-1" />}
            {s === "rejected" && <XCircle className="h-3.5 w-3.5 mr-1" />}
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1 text-xs">
                ({testimonials.filter((t) => t.status === s).length})
              </span>
            )}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No {filter !== "all" ? filter : ""} testimonials yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((t) => (
            <TestimonialCard
              key={t.id}
              id={t.id}
              rating={t.rating}
              content={t.content}
              createdAt={t.created_at}
              author={t.author}
              status={t.status}
              actions={
                t.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={updating === t.id}
                      onClick={() => handleStatusChange(t.id, "approved")}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                      disabled={updating === t.id}
                      onClick={() => handleStatusChange(t.id, "rejected")}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updating === t.id}
                    onClick={() =>
                      handleStatusChange(
                        t.id,
                        t.status === "approved" ? "rejected" : "approved"
                      )
                    }
                  >
                    {t.status === "approved" ? "Reject" : "Approve"}
                  </Button>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SKILL_CATEGORIES, AFFILIATE_PRODUCT_TYPES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export default function EditOfferPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [offerId, setOfferId] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    product_url: "",
    product_type: "digital",
    price_sats: "",
    commission_rate: "20",
    commission_type: "percentage",
    commission_flat_sats: "",
    cookie_days: "30",
    settlement_delay_days: "7",
    promo_text: "",
    category: "none",
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");

  const [btcUsd, setBtcUsd] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.replace("/login");
        } else {
          setAuthChecked(true);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    fetch("/api/rates/btc")
      .then((r) => r.json())
      .then((d) => {
        if (d.rate) setBtcUsd(d.rate);
      })
      .catch(() => {});
  }, []);

  function formatUsdEquiv(): string | null {
    if (form.commission_type === "percentage") {
      const price = parseFloat(form.price_sats);
      const rate = parseFloat(form.commission_rate);
      if (!price || !rate) return null;
      return `≈ $${((price * rate) / 100).toFixed(2)} USD per sale`;
    }
    if (form.commission_type === "flat") {
      const sats = parseInt(form.commission_flat_sats);
      if (!sats || !btcUsd) return null;
      const usd = (sats / 1e8) * btcUsd;
      return `≈ $${usd.toFixed(2)} USD per sale`;
    }
    return null;
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "commission_type") {
        if (value === "flat") next.commission_rate = "";
        if (value === "percentage") next.commission_flat_sats = "";
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/affiliates/offers?slug=${encodeURIComponent(slug)}&limit=1`)
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        const found = data.offers?.[0];
        if (found) {
          const detailRes = await fetch(`/api/affiliates/offers/${found.id}`);
          const detail = await detailRes.json();
          if (cancelled) return;
          const o = detail.offer;
          setOfferId(o.id);
          setForm({
            title: o.title || "",
            description: o.description || "",
            product_url: o.product_url || "",
            product_type: o.product_type || "digital",
            price_sats: String(o.price_sats || 0),
            commission_rate: String(Math.round((o.commission_rate || 0) * 100)),
            commission_type: o.commission_type || "percentage",
            commission_flat_sats: String(o.commission_flat_sats || 0),
            cookie_days: String(o.cookie_days || 30),
            settlement_delay_days: String(o.settlement_delay_days || 7),
            promo_text: o.promo_text || "",
            category: o.category || "none",
            tags: o.tags || [],
          });
        }
        if (!cancelled) setFetching(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!offerId) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/affiliates/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        product_url: form.product_url || undefined,
        product_type: form.product_type,
        price_sats: parseInt(form.price_sats) || 0,
        commission_rate: form.commission_type === "percentage" ? parseFloat(form.commission_rate) / 100 : 0,
        commission_type: form.commission_type,
        commission_flat_sats: form.commission_type === "flat" ? parseInt(form.commission_flat_sats) || 0 : 0,
        cookie_days: parseInt(form.cookie_days) || 30,
        settlement_delay_days: parseInt(form.settlement_delay_days) || 7,
        promo_text: form.promo_text || undefined,
        category: form.category === "none" ? undefined : form.category || undefined,
        tags: form.tags,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      router.push(`/affiliates/${data.offer?.slug || slug}`);
    } else {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setError(data.error || "Failed to update offer");
    }
    setLoading(false);
  }

  if (!authChecked || fetching) {
    return (
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
      <Link href={`/affiliates/${slug}`} className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        ← Back to offer
      </Link>

      <h1 className="text-3xl font-bold mb-2">Edit Affiliate Offer</h1>
      <p className="text-muted-foreground mb-6">
        Update your offer details
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => updateForm("title", e.target.value)}
            placeholder="e.g., AI Coding Assistant Skill Pack"
            required
            minLength={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            placeholder="Describe what affiliates will be promoting. Supports markdown."
            rows={5}
            required
            minLength={10}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product_type">Product Type</Label>
            <Select value={form.product_type} onValueChange={(v) => updateForm("product_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AFFILIATE_PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={form.category} onValueChange={(v) => updateForm("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {SKILL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product_url">Product URL</Label>
          <Input
            id="product_url"
            type="url"
            value={form.product_url}
            onChange={(e) => updateForm("product_url", e.target.value)}
            placeholder="https://..."
          />
          <p className="text-xs text-muted-foreground">Where buyers land after clicking affiliate links</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price_sats">Price (USD) *</Label>
          <Input
            id="price_sats"
            type="number"
            step="0.01"
            value={form.price_sats}
            onChange={(e) => updateForm("price_sats", e.target.value)}
            placeholder="29.99"
            required
            min={0}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Commission Type</Label>
            <Select value={form.commission_type} onValueChange={(v) => updateForm("commission_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="flat">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.commission_type === "percentage" && (
            <div key="commission-percentage" className="space-y-2">
              <Label htmlFor="commission_rate">Commission Rate (%)</Label>
              <Input
                id="commission_rate"
                type="number"
                value={form.commission_rate}
                onChange={(e) => updateForm("commission_rate", e.target.value)}
                placeholder="20"
                min={1}
                max={90}
              />
            </div>
          )}

          {form.commission_type === "flat" && (
            <div key="commission-flat" className="space-y-2">
              <Label htmlFor="commission_flat_sats">Commission per Sale (sats)</Label>
              <Input
                id="commission_flat_sats"
                type="number"
                value={form.commission_flat_sats}
                onChange={(e) => updateForm("commission_flat_sats", e.target.value)}
                placeholder="2000"
                min={1}
              />
            </div>
          )}
        </div>
        {formatUsdEquiv() && (
          <p className="text-xs text-muted-foreground -mt-4">{formatUsdEquiv()}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cookie_days">Cookie Window (days)</Label>
            <Input
              id="cookie_days"
              type="number"
              value={form.cookie_days}
              onChange={(e) => updateForm("cookie_days", e.target.value)}
              min={1}
              max={365}
            />
            <p className="text-xs text-muted-foreground">How long clicks are attributed</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement_delay_days">Settlement Delay (days)</Label>
            <Input
              id="settlement_delay_days"
              type="number"
              value={form.settlement_delay_days}
              onChange={(e) => updateForm("settlement_delay_days", e.target.value)}
              min={1}
              max={90}
            />
            <p className="text-xs text-muted-foreground">Hold period before payout</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="promo_text">Promo Materials (optional)</Label>
          <Textarea
            id="promo_text"
            value={form.promo_text}
            onChange={(e) => updateForm("promo_text", e.target.value)}
            placeholder="Swipe copy, talking points, or marketing materials for affiliates. Supports markdown."
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  const tag = tagInput.trim().replace(/^#/, "");
                  if (tag && !form.tags.includes(tag) && form.tags.length < 10) {
                    updateForm("tags", [...form.tags, tag] as any);
                    setTagInput("");
                  }
                }
              }}
              placeholder="Type a tag and press Enter"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!tagInput.trim()}
              onClick={() => {
                const tag = tagInput.trim().replace(/^#/, "");
                if (tag && !form.tags.includes(tag) && form.tags.length < 10) {
                  updateForm("tags", [...form.tags, tag] as any);
                  setTagInput("");
                }
              }}
            >
              Add
            </Button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.tags.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs gap-1 cursor-pointer"
                  onClick={() => updateForm("tags", form.tags.filter((t: string) => t !== tag) as any)}
                >
                  {tag}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
          <Link href={`/affiliates/${slug}`}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </main>
  );
}

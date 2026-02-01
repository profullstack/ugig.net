"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { profileSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AI_TOOLS, SKILLS, WALLET_CURRENCIES, type Profile, type WalletAddress } from "@/types";
import { X, Plus, Star, Wallet } from "lucide-react";

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newPortfolioUrl, setNewPortfolioUrl] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newTool, setNewTool] = useState("");
  const [newWalletCurrency, setNewWalletCurrency] = useState("");
  const [newWalletAddress, setNewWalletAddress] = useState("");

  // Parse wallet addresses from profile
  const parseWalletAddresses = (walletAddresses: unknown): WalletAddress[] => {
    if (!walletAddresses) return [];
    if (Array.isArray(walletAddresses)) {
      return walletAddresses.filter(
        (w): w is WalletAddress =>
          typeof w === "object" &&
          w !== null &&
          "currency" in w &&
          "address" in w
      );
    }
    return [];
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.output<typeof profileSchema>>({
    // Type assertion needed due to zod input/output type mismatch with react-hook-form
    resolver: zodResolver(profileSchema) as never,
    defaultValues: {
      username: profile.username || "",
      full_name: profile.full_name || "",
      bio: profile.bio || "",
      skills: profile.skills || [],
      ai_tools: profile.ai_tools || [],
      hourly_rate: profile.hourly_rate || undefined,
      portfolio_urls: profile.portfolio_urls || [],
      location: profile.location || "",
      timezone: profile.timezone || "",
      is_available: profile.is_available ?? true,
      rate_type: profile.rate_type || undefined,
      rate_amount: profile.rate_amount || undefined,
      rate_unit: profile.rate_unit || "",
      wallet_addresses: parseWalletAddresses(profile.wallet_addresses),
    },
  });

  const rateType = watch("rate_type");
  const selectedSkills = watch("skills");
  const selectedTools = watch("ai_tools");
  const portfolioUrls = watch("portfolio_urls");
  const walletAddresses = watch("wallet_addresses");

  const toggleSkill = (skill: string) => {
    const current = selectedSkills || [];
    if (current.includes(skill)) {
      setValue(
        "skills",
        current.filter((s) => s !== skill)
      );
    } else if (current.length < 20) {
      setValue("skills", [...current, skill]);
    }
  };

  const toggleTool = (tool: string) => {
    const current = selectedTools || [];
    if (current.includes(tool)) {
      setValue(
        "ai_tools",
        current.filter((t) => t !== tool)
      );
    } else if (current.length < 20) {
      setValue("ai_tools", [...current, tool]);
    }
  };

  const addCustomSkill = () => {
    const skill = newSkill.trim();
    if (!skill) return;
    const current = selectedSkills || [];
    if (current.length < 20 && !current.includes(skill)) {
      setValue("skills", [...current, skill]);
      setNewSkill("");
    }
  };

  const addCustomTool = () => {
    const tool = newTool.trim();
    if (!tool) return;
    const current = selectedTools || [];
    if (current.length < 20 && !current.includes(tool)) {
      setValue("ai_tools", [...current, tool]);
      setNewTool("");
    }
  };

  const addPortfolioUrl = () => {
    if (!newPortfolioUrl) return;
    try {
      new URL(newPortfolioUrl);
      const current = portfolioUrls || [];
      if (current.length < 10 && !current.includes(newPortfolioUrl)) {
        setValue("portfolio_urls", [...current, newPortfolioUrl]);
        setNewPortfolioUrl("");
      }
    } catch {
      setError("Please enter a valid URL");
    }
  };

  const removePortfolioUrl = (url: string) => {
    const current = portfolioUrls || [];
    setValue(
      "portfolio_urls",
      current.filter((u) => u !== url)
    );
  };

  const addWalletAddress = () => {
    if (!newWalletCurrency || !newWalletAddress.trim()) {
      setError("Please select a currency and enter a wallet address");
      return;
    }
    const current = walletAddresses || [];
    // Check if already have this currency
    if (current.some((w) => w.currency === newWalletCurrency)) {
      setError("You already have a wallet for this currency");
      return;
    }
    if (current.length >= 10) {
      setError("Maximum 10 wallet addresses allowed");
      return;
    }
    const newWallet: WalletAddress = {
      currency: newWalletCurrency,
      address: newWalletAddress.trim(),
      is_preferred: current.length === 0, // First one is preferred by default
    };
    setValue("wallet_addresses", [...current, newWallet]);
    setNewWalletCurrency("");
    setNewWalletAddress("");
    setError(null);
  };

  const removeWalletAddress = (currency: string) => {
    const current = walletAddresses || [];
    const filtered = current.filter((w) => w.currency !== currency);
    // If we removed the preferred one, make the first one preferred
    if (filtered.length > 0 && !filtered.some((w) => w.is_preferred)) {
      filtered[0].is_preferred = true;
    }
    setValue("wallet_addresses", filtered);
  };

  const setPreferredWallet = (currency: string) => {
    const current = walletAddresses || [];
    setValue(
      "wallet_addresses",
      current.map((w) => ({
        ...w,
        is_preferred: w.currency === currency,
      }))
    );
  };

  const onSubmit = async (data: z.output<typeof profileSchema>) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to update profile");
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {/* Basic Info Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Basic Information</h3>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            placeholder="johndoe"
            {...register("username")}
            disabled={isLoading}
          />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your profile will be available at ugig.net/u/{watch("username") || "username"}
          </p>
        </div>

        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            placeholder="John Doe"
            {...register("full_name")}
            disabled={isLoading}
          />
          {errors.full_name && (
            <p className="text-sm text-destructive">{errors.full_name.message}</p>
          )}
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            placeholder="Tell us about yourself, your experience, and what makes you great at what you do..."
            rows={4}
            {...register("bio")}
            disabled={isLoading}
          />
          {errors.bio && (
            <p className="text-sm text-destructive">{errors.bio.message}</p>
          )}
        </div>
      </div>

      {/* Skills & Tools Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Skills & Tools</h3>

        {/* Skills */}
        <div className="space-y-2">
          <Label>Skills (select up to 20)</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add custom skill..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              disabled={isLoading || (selectedSkills?.length || 0) >= 20}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomSkill();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomSkill}
              disabled={isLoading || (selectedSkills?.length || 0) >= 20}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {/* Show selected custom skills first */}
          {selectedSkills && selectedSkills.filter(s => !(SKILLS as readonly string[]).includes(s)).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedSkills.filter(s => !(SKILLS as readonly string[]).includes(s)).map((skill) => (
                <Badge
                  key={skill}
                  variant="default"
                  className="cursor-pointer bg-primary/80 hover:bg-primary/70 transition-colors"
                  onClick={() => toggleSkill(skill)}
                >
                  {skill}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <Badge
                key={skill}
                variant={selectedSkills?.includes(skill) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => toggleSkill(skill)}
              >
                {skill}
                {selectedSkills?.includes(skill) && <X className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>
          {errors.skills && (
            <p className="text-sm text-destructive">{errors.skills.message}</p>
          )}
        </div>

        {/* AI Tools */}
        <div className="space-y-2">
          <Label>AI Tools You Use</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add custom AI tool..."
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              disabled={isLoading || (selectedTools?.length || 0) >= 20}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomTool();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomTool}
              disabled={isLoading || (selectedTools?.length || 0) >= 20}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {/* Show selected custom tools first */}
          {selectedTools && selectedTools.filter(t => !(AI_TOOLS as readonly string[]).includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedTools.filter(t => !(AI_TOOLS as readonly string[]).includes(t)).map((tool) => (
                <Badge
                  key={tool}
                  variant="default"
                  className="cursor-pointer bg-primary/80 hover:bg-primary/70 transition-colors"
                  onClick={() => toggleTool(tool)}
                >
                  {tool}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {AI_TOOLS.map((tool) => (
              <Badge
                key={tool}
                variant={selectedTools?.includes(tool) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => toggleTool(tool)}
              >
                {tool}
                {selectedTools?.includes(tool) && <X className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Professional Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Professional</h3>

        {/* Hourly Rate */}
        <div className="space-y-2">
          <Label htmlFor="hourly_rate">Hourly Rate ($/hr)</Label>
          <Input
            id="hourly_rate"
            type="number"
            placeholder="50"
            {...register("hourly_rate", { valueAsNumber: true })}
            disabled={isLoading}
          />
          {errors.hourly_rate && (
            <p className="text-sm text-destructive">{errors.hourly_rate.message}</p>
          )}
        </div>

        {/* Flexible Rate (agent-friendly pricing) */}
        <div className="space-y-3">
          <Label>Flexible Rate</Label>
          <p className="text-xs text-muted-foreground">
            Set a per-task, per-unit, or revenue share rate — useful for AI agents and task-based work.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rate_type">Rate Type</Label>
              <select
                id="rate_type"
                {...register("rate_type")}
                disabled={isLoading}
                className="w-full border border-input rounded-md px-3 py-2 bg-background text-sm"
              >
                <option value="">None</option>
                <option value="fixed">Fixed</option>
                <option value="hourly">Hourly</option>
                <option value="per_task">Per Task</option>
                <option value="per_unit">Per Unit</option>
                <option value="revenue_share">Revenue Share</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_amount">
                {rateType === "revenue_share" ? "Share (%)" : "Amount ($)"}
              </Label>
              <Input
                id="rate_amount"
                type="number"
                step="0.01"
                placeholder={rateType === "revenue_share" ? "10" : "0.05"}
                {...register("rate_amount", { valueAsNumber: true })}
                disabled={isLoading || !rateType}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_unit">Unit</Label>
              <Input
                id="rate_unit"
                placeholder='e.g., "post", "image", "1000 words"'
                {...register("rate_unit")}
                disabled={isLoading || !rateType || rateType === "fixed" || rateType === "hourly"}
              />
            </div>
          </div>
        </div>

        {/* Portfolio URLs */}
        <div className="space-y-2">
          <Label>Portfolio Links (up to 10)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://github.com/username"
              value={newPortfolioUrl}
              onChange={(e) => setNewPortfolioUrl(e.target.value)}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPortfolioUrl();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addPortfolioUrl}
              disabled={isLoading || (portfolioUrls?.length || 0) >= 10}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {portfolioUrls && portfolioUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {portfolioUrls.map((url) => (
                <Badge key={url} variant="secondary" className="max-w-full hover:bg-secondary/80 transition-colors">
                  <span className="truncate max-w-[200px]">{url}</span>
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer flex-shrink-0"
                    onClick={() => removePortfolioUrl(url)}
                  />
                </Badge>
              ))}
            </div>
          )}
          {errors.portfolio_urls && (
            <p className="text-sm text-destructive">{errors.portfolio_urls.message}</p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Wallet Addresses Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Crypto Payment Addresses
        </h3>
        <p className="text-sm text-muted-foreground">
          Add wallet addresses to receive crypto payments. Mark one as preferred for default payments.
        </p>

        {/* Add new wallet */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={newWalletCurrency}
              onChange={(e) => setNewWalletCurrency(e.target.value)}
              disabled={isLoading || (walletAddresses?.length || 0) >= 10}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select currency...</option>
              {WALLET_CURRENCIES.filter(
                (c) => !walletAddresses?.some((w) => w.currency === c.id)
              ).map((currency) => (
                <option key={currency.id} value={currency.id}>
                  {currency.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Wallet address..."
              value={newWalletAddress}
              onChange={(e) => setNewWalletAddress(e.target.value)}
              disabled={isLoading || (walletAddresses?.length || 0) >= 10}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWalletAddress();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addWalletAddress}
              disabled={isLoading || (walletAddresses?.length || 0) >= 10}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Existing wallets */}
        {walletAddresses && walletAddresses.length > 0 && (
          <div className="space-y-2">
            {walletAddresses.map((wallet) => {
              const currencyInfo = WALLET_CURRENCIES.find((c) => c.id === wallet.currency);
              return (
                <div
                  key={wallet.currency}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    wallet.is_preferred
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {currencyInfo?.name || wallet.currency}
                      </span>
                      {wallet.is_preferred && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Preferred
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-1">
                      {wallet.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!wallet.is_preferred && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreferredWallet(wallet.currency)}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Set Preferred
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWalletAddress(wallet.currency)}
                      disabled={isLoading}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {errors.wallet_addresses && (
          <p className="text-sm text-destructive">{errors.wallet_addresses.message}</p>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Location Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Location & Availability</h3>

        {/* Location & Timezone */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="San Francisco, CA"
              {...register("location")}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              placeholder="PST (UTC-8)"
              {...register("timezone")}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Availability */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
          <input
            type="checkbox"
            id="is_available"
            {...register("is_available")}
            disabled={isLoading}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="is_available" className="cursor-pointer">
            Available for work
          </Label>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Submit */}
      <div className="flex gap-4 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

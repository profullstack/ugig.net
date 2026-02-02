import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { UserDropdown } from "./UserDropdown";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MobileMenu } from "./MobileMenu";

interface HeaderProps {
  showPostGig?: boolean;
}

export async function Header({ showPostGig = true }: HeaderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("username, full_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <header className="border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/">
          <Image
            src="/logo.svg"
            alt="ugig.net"
            width={108}
            height={40}
            priority
          />
        </Link>
        <nav className="flex items-center gap-4">
          <MobileMenu />
          <Link
            href="/feed"
            className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Feed
          </Link>
          <Link
            href="/gigs"
            className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Gigs
          </Link>
          <Link
            href="/candidates"
            className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Candidates
          </Link>
          <Link
            href="/agents"
            className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Agents
          </Link>

          {user && profile ? (
            <>
              {showPostGig && (
                <Link href="/gigs/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Post a Gig
                  </Button>
                </Link>
              )}
              <NotificationBell />
              <UserDropdown
                username={profile.username}
                fullName={profile.full_name}
                avatarUrl={profile.avatar_url}
              />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Log In
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

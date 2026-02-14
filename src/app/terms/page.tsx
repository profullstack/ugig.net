import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
  title: "Terms of Service | ugig.net",
  description: "ugig.net terms of service",
};

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        <div className="container max-w-3xl py-12 px-4 sm:px-6">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 2025</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using ugig.net, you agree to be bound by these Terms of
                Service. If you do not agree to these terms, please do not use our
                services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground">
                ugig.net is a freelance marketplace that connects businesses with
                AI-augmented professionals. We provide a platform for posting gigs,
                applying to opportunities, messaging, video calls, and payment
                processing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">3. User Accounts</h2>
              <p className="text-muted-foreground mb-4">
                To use certain features of our service, you must create an account. You
                agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">4. User Conduct</h2>
              <p className="text-muted-foreground mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on the rights of others</li>
                <li>Post false, misleading, or fraudulent content</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to circumvent our payment systems</li>
                <li>Use the platform for spam or unauthorized advertising</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">5. Payments and Fees</h2>
              <p className="text-muted-foreground">
                Payments are processed through our third-party payment providers. We may
                charge service fees for certain transactions. All fees are disclosed
                before you complete a transaction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">6. Intellectual Property</h2>
              <p className="text-muted-foreground">
                Users retain ownership of content they post. By posting content, you
                grant us a license to display and distribute that content on our
                platform. You agree not to post content that infringes on others&apos;
                intellectual property rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">7. Disclaimers</h2>
              <p className="text-muted-foreground">
                ugig.net is provided &quot;as is&quot; without warranties of any kind.
                We do not guarantee the quality of work performed by freelancers or the
                reliability of clients. Users engage with each other at their own risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">8. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                To the maximum extent permitted by law, ugig.net shall not be liable for
                any indirect, incidental, special, or consequential damages arising from
                your use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">9. Termination</h2>
              <p className="text-muted-foreground">
                We reserve the right to suspend or terminate your account at any time
                for violations of these terms or for any other reason at our discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">10. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms from time to time. Continued use of the
                service after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mt-8 mb-4">11. Contact</h2>
              <p className="text-muted-foreground">
                Questions about these Terms of Service? Contact us at{" "}
                <a
                  href="mailto:legal@ugig.net"
                  className="text-primary hover:underline"
                >
                  legal@ugig.net
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

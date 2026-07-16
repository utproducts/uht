/*
  ISOLATED PAGE — zero shared component imports.
  Video served from R2 via API, page is fully self-contained.
  Safe from breakage during site updates.
*/

export default function CoachesMeetingPage() {
  const videoUrl = 'https://uht.chad-157.workers.dev/api/assets/videos/coach-meeting-2026-07-14.mp4';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #001d3d, #003566)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ maxWidth: 800, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/uht-logo.png"
            alt="Ultimate Hockey Tournaments"
            style={{ height: 80, margin: '0 auto 16px' }}
          />
          <h1 style={{
            fontSize: 28,
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 8px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}>
            Coach/Manager Meeting Recording
          </h1>
          <p style={{
            fontSize: 16,
            color: '#93c5fd',
            margin: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}>
            2026&ndash;27 Season Kickoff &bull; July 14, 2026
          </p>
        </div>

        {/* Video Card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <video
            controls
            preload="metadata"
            playsInline
            style={{
              width: '100%',
              display: 'block',
              backgroundColor: '#000',
            }}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>

          {/* Info below video */}
          <div style={{ padding: '24px 28px' }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#001d3d',
              margin: '0 0 12px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
              What We Covered
            </h2>
            <ul style={{
              margin: 0,
              padding: '0 0 0 20px',
              color: '#374151',
              fontSize: 15,
              lineHeight: 1.8,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
              <li>2026&ndash;27 season schedule release</li>
              <li>New UHT mobile app &mdash; live scores, schedules, and team management</li>
              <li>Registration &amp; team setup walkthrough</li>
            </ul>

            {/* CTA */}
            <div style={{
              marginTop: 24,
              padding: '20px 24px',
              backgroundColor: '#f0f4f8',
              borderRadius: 12,
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#003e79',
                margin: '0 0 12px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}>
                Ready to get started?
              </p>
              <a
                href="https://ultimatetournaments.com/register"
                style={{
                  display: 'inline-block',
                  padding: '12px 32px',
                  backgroundColor: '#003e79',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 700,
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              >
                Register Your Team
              </a>
            </div>
          </div>
        </div>

        <p style={{
          textAlign: 'center',
          color: 'rgba(147, 197, 253, 0.5)',
          fontSize: 12,
          marginTop: 24,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          Ultimate Hockey Tournaments &bull; ultimatetournaments.com
        </p>
      </div>
    </div>
  );
}

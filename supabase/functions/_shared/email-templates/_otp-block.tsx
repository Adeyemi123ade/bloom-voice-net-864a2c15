/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Section, Text } from 'npm:@react-email/components@0.0.22'

/**
 * Shared "Bold & Friendly" 6-digit code chip for ChiChat auth emails.
 * Renders the code with a green pill background, centered, mobile-safe.
 */
export const OtpCodeBlock = ({ token }: { token: string }) => {
  // Format with a single space in the middle for legibility (works for 6 or 8 digits)
  const t = token || ''
  const mid = Math.floor(t.length / 2)
  const display = t.length >= 4 ? `${t.slice(0, mid)} ${t.slice(mid)}` : t

  return (
    <Section style={{ textAlign: 'center', margin: '8px 0 18px' }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="center" style={{ margin: '0 auto' }}>
        <tbody>
          <tr>
            <td
              align="center"
              style={{
                backgroundColor: '#0B8F6C',
                borderRadius: '14px',
                padding: '20px 32px',
              }}
            >
              <Text
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Mono", Menlo, monospace',
                  fontSize: t.length > 6 ? '32px' : '38px',
                  fontWeight: 'bold' as const,
                  color: '#ffffff',
                  letterSpacing: t.length > 6 ? '4px' : '6px',
                  margin: 0,
                  lineHeight: '1.1',
                }}
              >
                {display}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
      <Text style={{ fontSize: '13px', color: '#8A8A8A', margin: '14px 0 0' }}>
        This code expires in <strong style={{ color: '#121212' }}>10 minutes</strong>.
      </Text>
    </Section>
  )
}

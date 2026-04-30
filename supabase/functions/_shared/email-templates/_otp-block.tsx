/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Section, Text } from 'npm:@react-email/components@0.0.22'

/**
 * Shared "Bold & Friendly" 6-digit code chip for ChiChat auth emails.
 * Renders the code with a green pill background, centered, mobile-safe.
 */
export const OtpCodeBlock = ({ token }: { token: string }) => {
  // Always display as a 6-digit code, formatted as 3 + 3 for legibility.
  const raw = (token || '').replace(/\D/g, '')
  const t = raw.length >= 6 ? raw.slice(0, 6) : raw.padStart(6, '0')
  const display = `${t.slice(0, 3)} ${t.slice(3)}`

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
                  fontSize: '38px',
                  fontWeight: 'bold' as const,
                  color: '#ffffff',
                  letterSpacing: '6px',
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

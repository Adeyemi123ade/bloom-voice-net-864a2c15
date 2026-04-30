/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Section, Text } from 'npm:@react-email/components@0.0.22'

const LOGO_URL =
  'https://tlyqomftfabnpczxefkp.supabase.co/storage/v1/object/public/email-assets/chichat-logo.png'

/**
 * Branded ChiChat email header — round logo + wordmark + tagline.
 */
export const BrandHeader = () => (
  <Section style={{ marginBottom: '28px' }}>
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', width: '64px' }}>
            <img
              src={LOGO_URL}
              alt="ChiChat"
              width="56"
              height="56"
              style={{ display: 'block', borderRadius: '14px', border: '1px solid #E6F1EC' }}
            />
          </td>
          <td style={{ verticalAlign: 'middle', paddingLeft: '14px' }}>
            <Text
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold' as const,
                color: '#0B8F6C',
                letterSpacing: '0.2px',
                lineHeight: '1.1',
              }}
            >
              ChiChat
            </Text>
            <Text style={{ margin: '2px 0 0', fontSize: '12px', color: '#8A8A8A' }}>
              Experience the possibilities
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  </Section>
)

/**
 * Three-up value-prop strip shown near the bottom of branded emails.
 */
const PILL: React.CSSProperties = {
  display: 'inline-block',
  width: '36px',
  height: '36px',
  lineHeight: '36px',
  borderRadius: '999px',
  backgroundColor: '#E6F4EE',
  color: '#0B8F6C',
  fontSize: '18px',
  textAlign: 'center' as const,
  fontWeight: 'bold' as const,
}
const FEAT_TITLE: React.CSSProperties = {
  margin: '8px 0 2px',
  fontSize: '13px',
  fontWeight: 'bold' as const,
  color: '#121212',
}
const FEAT_TEXT: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  color: '#8A8A8A',
  lineHeight: '1.45',
}

export const FeatureStrip = () => (
  <Section style={{ marginTop: '24px', borderTop: '1px solid #ECECEC', paddingTop: '20px' }}>
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%' }}>
      <tbody>
        <tr>
          <td style={{ width: '33.33%', verticalAlign: 'top', paddingRight: '8px' }}>
            <span style={PILL}>🛡️</span>
            <Text style={FEAT_TITLE}>Secure</Text>
            <Text style={FEAT_TEXT}>Your privacy comes first.</Text>
          </td>
          <td style={{ width: '33.33%', verticalAlign: 'top', padding: '0 8px' }}>
            <span style={PILL}>👥</span>
            <Text style={FEAT_TITLE}>Connect</Text>
            <Text style={FEAT_TEXT}>Stay close with the people you care about.</Text>
          </td>
          <td style={{ width: '33.33%', verticalAlign: 'top', paddingLeft: '8px' }}>
            <span style={PILL}>⚡</span>
            <Text style={FEAT_TITLE}>Fast</Text>
            <Text style={FEAT_TEXT}>Real-time messaging that keeps up with you.</Text>
          </td>
        </tr>
      </tbody>
    </table>
  </Section>
)

/** Heart-felt sign-off block. */
export const SignOff = ({ message = "Thank you for choosing ChiChat. We're excited to have you on board." }: { message?: string }) => (
  <Section style={{ marginTop: '22px' }}>
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', paddingRight: '12px' }}>
            <span style={PILL}>💬</span>
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <Text style={{ margin: 0, fontSize: '13px', color: '#3a3a3a', lineHeight: '1.5' }}>
              {message}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
    <Text
      style={{
        margin: '14px 0 0',
        fontSize: '20px',
        fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive',
        fontStyle: 'italic' as const,
        color: '#0B8F6C',
        textAlign: 'right' as const,
      }}
    >
      Let&rsquo;s chat ♥
    </Text>
  </Section>
)

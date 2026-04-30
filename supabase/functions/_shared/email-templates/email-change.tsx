/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BrandHeader, FeatureStrip, SignOff } from './_brand.tsx'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new ChiChat email address</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />

        <Heading style={h1}>Confirm your new email</Heading>

        <Text style={text}>
          You requested to change your ChiChat email from <strong>{email}</strong> to <strong>{newEmail}</strong>.
          Tap the button below to confirm this change.
        </Text>

        <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="center" style={{ margin: '8px auto 18px' }}>
          <tbody>
            <tr>
              <td align="center" style={{ backgroundColor: '#0B8F6C', borderRadius: '12px' }}>
                <Button style={button} href={confirmationUrl}>
                  Confirm change
                </Button>
              </td>
            </tr>
          </tbody>
        </table>

        <Text style={footer}>
          If you didn&rsquo;t request this change, please secure your account immediately.
        </Text>

        <FeatureStrip />
        <SignOff message="Your account, your control. We're just here to help." />

        <div style={hr} />
        <Text style={tinyFooter}>© ChiChat · Experience the possibilities</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '26px', fontWeight: 'bold' as const, color: '#121212', margin: '0 0 16px', lineHeight: '1.25' }
const text = { fontSize: '16px', color: '#3a3a3a', lineHeight: '1.65', margin: '0 0 18px' }
const button = { backgroundColor: '#0B8F6C', color: '#ffffff', fontSize: '16px', fontWeight: 'bold' as const, borderRadius: '12px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#8A8A8A', margin: '20px 0 0', lineHeight: '1.55', textAlign: 'center' as const }
const hr = { borderTop: '1px solid #ECECEC', margin: '28px 0 14px' }
const tinyFooter = { fontSize: '11px', color: '#B0B0B0', textAlign: 'center' as const, margin: 0 }

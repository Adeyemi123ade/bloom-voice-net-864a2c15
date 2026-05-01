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
import { BrandHeader } from './_brand.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You&rsquo;ve been invited to ChiChat — come say hi 👋</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />

        <Heading style={h1}>
          Someone wants to chat with you <span style={{ color: '#F5C518' }}>👋</span>
        </Heading>

        <Text style={text}>
          Welcome to ChiChat — where conversations don&rsquo;t end and people never feel far away.
          A friend just sent you an invite. Tap the button below to accept and start chatting.
        </Text>

        <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="center" style={{ margin: '8px auto 18px' }}>
          <tbody>
            <tr>
              <td align="center" style={{ backgroundColor: '#0B8F6C', borderRadius: '12px' }}>
                <Button style={button} href={confirmationUrl}>
                  Accept invitation
                </Button>
              </td>
            </tr>
          </tbody>
        </table>

        <Text style={footer}>
          If you weren&rsquo;t expecting this invitation, you can safely ignore this email.
        </Text>

        <div style={hr} />
        <Text style={tinyFooter}>© ChiChat · Experience the possibilities</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '28px', fontWeight: 'bold' as const, color: '#121212', margin: '0 0 16px', lineHeight: '1.25' }
const text = { fontSize: '16px', color: '#3a3a3a', lineHeight: '1.65', margin: '0 0 18px' }
const button = { backgroundColor: '#0B8F6C', color: '#ffffff', fontSize: '16px', fontWeight: 'bold' as const, borderRadius: '12px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#8A8A8A', margin: '20px 0 0', lineHeight: '1.55', textAlign: 'center' as const }
const hr = { borderTop: '1px solid #ECECEC', margin: '28px 0 14px' }
const tinyFooter = { fontSize: '11px', color: '#B0B0B0', textAlign: 'center' as const, margin: 0 }

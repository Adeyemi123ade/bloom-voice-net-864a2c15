package com.bloomvoicenet.chat;

import android.os.CancellationSignal;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * "Continue with Google" with Android's own Google account picker.
 *
 * Google Play services shows the person's Google accounts, they pick one,
 * and Google hands back a signed ID token. The web side passes that token to
 * Supabase (signInWithIdToken), which checks it directly with Google. No
 * browser, no one-time code, no return link: the browser round trip is what
 * failed on Android ("Unable to exchange external code").
 *
 * Needs, in the same Google Cloud project as the web client:
 * an OAuth client of type Android for com.bloomvoicenet.chat with the SHA-1
 * of every key that signs the APK (debug key, upload key, and later the
 * Google Play app signing key).
 *
 * Errors come back as codes the web side understands, always with Google's
 * own message (also written to logcat, tag ChiChatGoogle):
 *   "cancelled"   the person closed the picker
 *   "setup"       Google refused this app: the Android OAuth client is
 *                 missing or its package name / SHA-1 doesn't match the key
 *                 that signed this APK. Google reports this as a
 *                 *cancellation* ("[16] Account reauth failed"), which is
 *                 why it used to look like the person closed the picker.
 *   "no_account"  no Google account on the phone (or none allowed)
 *   "failed"      anything else (message says what)
 */
@CapacitorPlugin(name = "ChiChatGoogle")
public class ChiChatGooglePlugin extends Plugin {

    // GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL, spelled out so
    // it reads the same from Java whatever the library version.
    private static final String GOOGLE_ID_TOKEN_TYPE =
            "com.google.android.libraries.identity.googleid.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL";

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("serverClientId missing", "failed");
            return;
        }

        GetSignInWithGoogleOption.Builder option = new GetSignInWithGoogleOption.Builder(serverClientId);
        if (nonce != null && !nonce.isEmpty()) option.setNonce(nonce);

        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option.build())
                .build();

        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        handle(call, result.getCredential());
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        String detail = e.getType() + ": " + e.getMessage();
                        Log.w(TAG, "sign in failed: " + detail, e);
                        call.reject(detail, errorCode(e));
                    }
                });
    }

    private static final String TAG = "ChiChatGoogle";

    /** Maps Credential Manager's exception to a code (see the class comment). */
    static String errorCode(GetCredentialException e) {
        String msg = String.valueOf(e.getMessage()).toLowerCase();
        if (looksLikeSetupProblem(msg)) return "setup";
        if (e instanceof GetCredentialCancellationException) return "cancelled";
        if (e instanceof NoCredentialException) return "no_account";
        return "failed";
    }

    /** Google's messages for "this app isn't allowed to ask for a token". */
    static boolean looksLikeSetupProblem(String msg) {
        return msg.contains("[16]") || msg.contains("reauth") || msg.contains("[10]")
                || msg.contains("28444") || msg.contains("developer console");
    }

    private void handle(PluginCall call, Credential credential) {
        try {
            if (credential instanceof CustomCredential
                    && GOOGLE_ID_TOKEN_TYPE.equals(credential.getType())) {
                GoogleIdTokenCredential google = GoogleIdTokenCredential.Companion.createFrom(credential.getData());
                JSObject ret = new JSObject();
                ret.put("idToken", google.getIdToken());
                ret.put("email", google.getId());
                ret.put("name", google.getDisplayName());
                call.resolve(ret);
                return;
            }
            call.reject("Unexpected credential type: " + credential.getType(), "failed");
        } catch (Throwable t) {
            call.reject("Could not read the Google account: " + t.getMessage(), "failed");
        }
    }
}

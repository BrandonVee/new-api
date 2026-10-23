package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/BrandonVee/ai-gateway/common"
	"github.com/BrandonVee/ai-gateway/model"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useTestSessionSecret(t *testing.T) {
	t.Helper()
	previous := common.SessionSecret
	common.SessionSecret = "test-session-secret-with-sufficient-entropy"
	t.Cleanup(func() { common.SessionSecret = previous })
}

func TestAccessTokenRoundTripAndPurposeIsolation(t *testing.T) {
	setupAuthSessionTestDB(t)
	useTestSessionSecret(t)
	identity := AuthIdentity{UserID: 42, SessionID: "session-1", UserAuthVersion: 3, SessionVersion: 2}

	token, expiresAt, err := IssueAccessToken(identity)
	require.NoError(t, err)
	assert.Positive(t, expiresAt)

	parsed, err := ParseAccessToken(token)
	require.NoError(t, err)
	assert.Equal(t, identity, parsed)

	binding, err := BindVerificationOperation(VerificationOperation{Scope: "channel.key.read", Context: []byte(`{"channel_id":123}`)})
	require.NoError(t, err)
	proof, _, err := IssueSecurityProof(identity, "2fa", binding)
	require.NoError(t, err)
	_, err = ParseAccessToken(proof)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestAccessTokenUsesGatewayIdentityAndRejectsForeignClaims(t *testing.T) {
	useTestSessionSecret(t)
	identity := AuthIdentity{UserID: 42, SessionID: "gateway-session", UserAuthVersion: 1, SessionVersion: 1}
	raw, _, err := IssueAccessToken(identity)
	require.NoError(t, err)
	claims := &authClaims{}
	_, _, err = jwt.NewParser().ParseUnverified(raw, claims)
	require.NoError(t, err)
	assert.Equal(t, "ai-gateway", claims.Issuer)
	assert.Equal(t, jwt.ClaimStrings{"ai-gateway-dashboard"}, claims.Audience)

	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	_, err = mac.Write([]byte("ai-gateway/auth/access/v1"))
	require.NoError(t, err)
	_, err = jwt.ParseWithClaims(raw, &authClaims{}, func(*jwt.Token) (any, error) {
		return mac.Sum(nil), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer("ai-gateway"), jwt.WithAudience("ai-gateway-dashboard"))
	require.NoError(t, err)

	for _, tc := range []struct {
		name, issuer, audience string
	}{
		{name: "foreign issuer", issuer: "other-gateway", audience: "ai-gateway-dashboard"},
		{name: "foreign audience", issuer: "ai-gateway", audience: "other-dashboard"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			modified := *claims
			modified.Issuer = tc.issuer
			modified.Audience = jwt.ClaimStrings{tc.audience}
			signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, modified).SignedString(authSigningKey(accessTokenUse))
			require.NoError(t, err)
			_, err = ParseAccessToken(signed)
			assert.ErrorIs(t, err, ErrAuthTokenInvalid)
		})
	}
}

func TestAccessTokenRejectsTampering(t *testing.T) {
	useTestSessionSecret(t)
	identity := AuthIdentity{UserID: 42, SessionID: "session-1", UserAuthVersion: 1, SessionVersion: 1}
	token, _, err := IssueAccessToken(identity)
	require.NoError(t, err)

	tamperAt := len(token) - 2
	replacement := "x"
	if token[tamperAt] == 'x' {
		replacement = "y"
	}
	tampered := token[:tamperAt] + replacement + token[tamperAt+1:]
	_, err = ParseAccessToken(tampered)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)

	_, internal, err := ParseDashboardAccessToken(tampered)
	assert.True(t, internal)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestDashboardAccessTokenClassification(t *testing.T) {
	setupAuthSessionTestDB(t)
	useTestSessionSecret(t)

	identity, internal, err := ParseDashboardAccessToken("opaque.key.with-dots")
	require.NoError(t, err)
	assert.False(t, internal)
	assert.Empty(t, identity)

	external := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": "external-issuer",
		"aud": authTokenAudience,
		"exp": time.Now().Add(time.Minute).Unix(),
	})
	externalRaw, err := external.SignedString([]byte("external-secret"))
	require.NoError(t, err)
	_, internal, err = ParseDashboardAccessToken(externalRaw)
	require.NoError(t, err)
	assert.False(t, internal)

	unknownUse := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss":       authTokenIssuer,
		"aud":       authTokenAudience,
		"token_use": "third_party",
		"exp":       time.Now().Add(time.Minute).Unix(),
	})
	unknownUseRaw, err := unknownUse.SignedString([]byte("external-secret"))
	require.NoError(t, err)
	_, internal, err = ParseDashboardAccessToken(unknownUseRaw)
	require.NoError(t, err)
	assert.False(t, internal)

	binding, err := BindVerificationOperation(VerificationOperation{Scope: "channel.key.read", Context: []byte(`{"channel_id":123}`)})
	require.NoError(t, err)
	proof, _, err := IssueSecurityProof(AuthIdentity{
		UserID: 42, SessionID: "session-1", UserAuthVersion: 1, SessionVersion: 1,
	}, "2fa", binding)
	require.NoError(t, err)
	_, internal, err = ParseDashboardAccessToken(proof)
	assert.True(t, internal)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)

	expiredClaims := authClaims{
		TokenUse:        accessTokenUse,
		SessionID:       "expired-session",
		UserAuthVersion: 1,
		SessionVersion:  1,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    authTokenIssuer,
			Subject:   "42",
			Audience:  jwt.ClaimStrings{authTokenAudience},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			NotBefore: jwt.NewNumericDate(time.Now().Add(-2 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Minute)),
			ID:        "expired-token",
		},
	}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims).SignedString(authSigningKey(accessTokenUse))
	require.NoError(t, err)
	_, internal, err = ParseDashboardAccessToken(expired)
	assert.True(t, internal)
	assert.ErrorIs(t, err, ErrAuthTokenExpired)
}

func TestSecurityProofBindsIdentityAndOperation(t *testing.T) {
	setupAuthSessionTestDB(t)
	useTestSessionSecret(t)
	identity := AuthIdentity{UserID: 42, SessionID: "session-1", UserAuthVersion: 3, SessionVersion: 2}
	operation := VerificationOperation{Scope: "channel.key.read", Context: []byte(`{"channel_id":123}`)}
	binding, err := BindVerificationOperation(operation)
	require.NoError(t, err)
	proof, _, err := IssueSecurityProof(identity, "2fa", binding)
	require.NoError(t, err)

	claims, err := verifySecurityProof(proof, identity, binding)
	require.NoError(t, err)
	assert.Equal(t, "2fa", claims.Method)

	wrongScope, err := BindVerificationOperation(VerificationOperation{Scope: "passkey.delete"})
	require.NoError(t, err)
	_, err = verifySecurityProof(proof, identity, wrongScope)
	assert.ErrorIs(t, err, ErrProofScope)

	otherChannel, err := BindVerificationOperation(VerificationOperation{Scope: "channel.key.read", Context: []byte(`{"channel_id":456}`)})
	require.NoError(t, err)
	_, err = verifySecurityProof(proof, identity, otherChannel)
	assert.ErrorIs(t, err, ErrProofContext)

	otherSession := identity
	otherSession.SessionID = "session-2"
	_, err = verifySecurityProof(proof, otherSession, binding)
	assert.True(t, errors.Is(err, ErrAuthTokenInvalid))

	claims, err = parseAuthClaims(proof, securityProofTokenUse, authSigningKey(securityProofTokenUse))
	require.NoError(t, err)
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(securityProofTokenUse))
	require.NoError(t, err)
	_, err = ConsumeOperationProof(expired, identity, operation)
	assert.ErrorIs(t, err, ErrAuthTokenExpired)
}

func TestSecurityProofBindsAccessTokenSession(t *testing.T) {
	setupAuthSessionTestDB(t)
	useTestSessionSecret(t)
	identity := AuthIdentity{UserID: 42, SessionID: model.AccessTokenSessionID(7), UserAuthVersion: 3, SessionVersion: model.AccessTokenSessionVersion}
	binding, err := BindVerificationOperation(VerificationOperation{Scope: VerificationScopeTwoFADisable})
	require.NoError(t, err)
	proof, _, err := IssueSecurityProof(identity, "password", binding)
	require.NoError(t, err)

	claims, err := verifySecurityProof(proof, identity, binding)
	require.NoError(t, err)
	assert.Equal(t, identity.SessionID, claims.SessionID)

	for _, sessionID := range []string{model.AccessTokenSessionID(8), "session-1"} {
		other := identity
		other.SessionID = sessionID
		_, err = verifySecurityProof(proof, other, binding)
		assert.ErrorIs(t, err, ErrAuthTokenInvalid, sessionID)
	}
}

func TestGatewayRefreshCookiesPreserveSecurityAttributesAndClearTogether(t *testing.T) {
	previousSecure := common.SessionCookieSecure
	common.SessionCookieSecure = true
	t.Cleanup(func() { common.SessionCookieSecure = previousSecure })
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	WriteRefreshCookie(ctx, "cookie-test-value")
	cookies := recorder.Result().Cookies()
	require.Len(t, cookies, 2)
	assert.Equal(t, "ai_gateway_refresh", cookies[0].Name)
	assert.Equal(t, "/api/user/auth", cookies[0].Path)
	assert.True(t, cookies[0].HttpOnly)
	assert.True(t, cookies[0].Secure)
	assert.Equal(t, http.SameSiteStrictMode, cookies[0].SameSite)
	assert.Positive(t, cookies[0].MaxAge)
	assert.Equal(t, "ai_gateway_has_session", cookies[1].Name)
	assert.Equal(t, "/", cookies[1].Path)
	assert.Equal(t, "1", cookies[1].Value)
	assert.False(t, cookies[1].HttpOnly)
	assert.True(t, cookies[1].Secure)
	assert.Equal(t, http.SameSiteStrictMode, cookies[1].SameSite)
	assert.Equal(t, cookies[0].MaxAge, cookies[1].MaxAge)
	assert.Equal(t, cookies[0].Expires, cookies[1].Expires)

	clearedRecorder := httptest.NewRecorder()
	clearedContext, _ := gin.CreateTestContext(clearedRecorder)
	ClearRefreshCookie(clearedContext)
	cleared := clearedRecorder.Result().Cookies()
	require.Len(t, cleared, 2)
	for index, cookie := range cleared {
		assert.Equal(t, cookies[index].Name, cookie.Name)
		assert.Equal(t, cookies[index].Path, cookie.Path)
		assert.Equal(t, cookies[index].HttpOnly, cookie.HttpOnly)
		assert.True(t, cookie.Secure)
		assert.Equal(t, http.SameSiteStrictMode, cookie.SameSite)
		assert.Equal(t, -1, cookie.MaxAge)
		assert.Empty(t, cookie.Value)
	}
}

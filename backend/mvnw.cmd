@ECHO OFF
REM Thin wrapper that delegates to a locally cached Maven distribution,
REM so the backend can be built without a separate system-wide Maven install.
SET MAVEN_HOME=%USERPROFILE%\.m2\wrapper\dists\apache-maven-3.9.10-bin\53h08a94dg6djh6umvruv7q564\apache-maven-3.9.10
"%MAVEN_HOME%\bin\mvn.cmd" %*

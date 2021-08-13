%{!?python3_sitelib: %define python3_sitelib %(python3 -c "from distutils.sysconfig import get_python_lib;print(get_python_lib())")}
%{!?python3_version: %define python3_version %(python3 -c "import sys; sys.stdout.write(sys.version[:3])")}

Name: {{name}}
Version: 0.1.1
Release: 1%{?dist}
Summary: Hello World example implemented in python

License: MIT
Vendor: Microsoft Corporation
Distribution: Mariner
URL: https://www.example.com/%{name}
Source0: https://www.example.com/%{name}/releases/%{name}-%{version}.tar.gz

BuildRequires:  python3
BuildRequires:  python3-devel
BuildRequires:  python3-libs
Requires:       python3
Requires:       bash

BuildArch:      noarch

%description
The long-tail description for our Hello World Example implemented in Python.

%prep
%setup -q

%build
python3 -m compileall -b %{name}.py

%install
mkdir -p %{buildroot}/%{_bindir}
mkdir -p %{buildroot}/usr/lib/%{name}
mkdir -p %{buildroot}%{python3_sitelib}/*

cat > %{buildroot}/%{_bindir}/%{name} <<-EOF
#!/bin/bash
/usr/bin/python3 /usr/lib/%{name}/%{name}.pyc
EOF

chmod 0755 %{buildroot}/%{_bindir}/%{name}
install -m 0644 %{name}.py* %{buildroot}/usr/lib/%{name}/

%files
%defattr(-,root,root,-)
%dir /usr/lib/%{name}/
%{_bindir}/%{name}
/usr/lib/%{name}/%{name}.py*
%{python3_sitelib}/*


%changelog
* {{date}} {{username}} <{{email}}> - 1.0-1
  - Initial set up
